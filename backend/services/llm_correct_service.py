"""
LLM Speaker Correction Service.

Runs as a background checkpoint every ~25 s during live sessions.
Whisper + pyannote give us text + voice-based speaker labels.
This service adds a semantic layer: Groq LLaMA reads the conversation
and corrects any misidentified Doctor / Patient labels based on context.

Design:
  - Sliding window: never sends more than MAX_SEGS segments per call
  - Context memory: tracks which raw voice label (Speaker 1 / Speaker 2)
    maps to Doctor / Patient across successive calls
  - Non-blocking: called from a background interval, never on the hot path
"""
import json
import re
from typing import List, Dict, Any, Optional

MAX_SEGS = 50   # 70B model handles larger windows comfortably

_SYSTEM = (
    "You are a clinical transcription analyst specialising in doctor-patient conversations. "
    "Reply with only a valid JSON array."
)

_PROMPT = """\
A doctor is consulting a patient. The transcript segments below have auto-assigned \
speaker labels that may be wrong. Correct every label.

{context_block}

DOCTOR speaks like:
  • Clinical terms: diagnosis, prescription, dosage, CBC, ECG, referral
  • Directed questions: "How long?", "Any allergies?", "Where is the pain?"
  • Instructions: "Take twice daily", "Avoid...", "Come back in a week"
  • Interpreting results: "Your BP is...", "The scan shows...", "Blood work is normal"
  • Usually leads the conversation and speaks first

PATIENT speaks like:
  • Symptoms: "I've been feeling...", "It started...", "The pain is here"
  • Short answers: "Yes doctor", "About 3 days", "No I haven't"
  • Concerns: "Will it get better?", "Is it serious?"
  • Personal: "I had this before", "My mother also had..."

Override the existing label only when the text clearly contradicts it. \
When in doubt, keep the established context.

Reply with ONLY a JSON array — no explanation, no markdown:
[{{"id": <number>, "speaker": "Doctor" | "Patient"}}, ...]

Segments:
{segments_text}"""

_CTX_KNOWN = (
    "ESTABLISHED CONTEXT: {doctor_label} maps to Doctor, {patient_label} maps to Patient. "
    "Maintain this mapping; override only when transcript evidence is conclusive."
)
_CTX_COLD = (
    "CONTEXT: First pass — infer Doctor vs Patient purely from clinical language and turn-taking."
)


def _context_block(ctx: Optional[Dict]) -> str:
    if ctx and ctx.get("doctor_label") and ctx.get("patient_label"):
        return _CTX_KNOWN.format(
            doctor_label=ctx["doctor_label"],
            patient_label=ctx["patient_label"],
        )
    return _CTX_COLD


def _parse(raw: str) -> List[Dict]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = raw.rsplit("```", 1)[0].strip()
    m = re.search(r"\[.*\]", raw, re.DOTALL)
    return json.loads(m.group() if m else raw)


def _update_context(
    window: List[Dict],
    corrections: List[Dict],
    prev_ctx: Optional[Dict],
) -> Dict[str, Optional[str]]:
    """
    Majority-vote which raw label (Speaker 1 / Speaker 2) maps to Doctor/Patient.
    Falls back to the previous context value when the vote is inconclusive.
    """
    id_to_raw: Dict[int, str] = {s["id"]: s.get("speaker", "") for s in window}
    doctor_votes: Dict[str, int] = {}
    patient_votes: Dict[str, int] = {}

    for c in corrections:
        raw = id_to_raw.get(c.get("id"))
        if not raw:
            continue
        if c.get("speaker") == "Doctor":
            doctor_votes[raw] = doctor_votes.get(raw, 0) + 1
        else:
            patient_votes[raw] = patient_votes.get(raw, 0) + 1

    def top(d: Dict[str, int]) -> Optional[str]:
        return max(d, key=lambda k: d[k]) if d else None

    new_ctx = {
        "doctor_label":  top(doctor_votes),
        "patient_label": top(patient_votes),
    }

    # Preserve prior context when the current pass didn't yield a clear winner
    if prev_ctx:
        if not new_ctx["doctor_label"]:
            new_ctx["doctor_label"] = prev_ctx.get("doctor_label")
        if not new_ctx["patient_label"]:
            new_ctx["patient_label"] = prev_ctx.get("patient_label")

    return new_ctx


def correct_speakers(
    segments: List[Dict[str, Any]],
    context:  Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Correct speaker labels for a sliding window of transcript segments.

    Args:
        segments : list of {id, speaker, text}  — the last N from the session
        context  : optional {"doctor_label": str, "patient_label": str}
                   established on prior passes (None on cold start)

    Returns on success:
        {
          "corrections": [{"id": N, "speaker": "Doctor"|"Patient"}, ...],
          "context":     {"doctor_label": "Speaker 1", "patient_label": "Speaker 2"},
        }

    Returns on skip / error:
        {"skipped": True, "reason": "..."} or {"error": "..."}
    """
    from config import Config

    if not Config.GROQ_API_KEY:
        return {"skipped": True, "reason": "GROQ_API_KEY not set"}

    window = segments[-MAX_SEGS:]
    if len(window) < 2:
        return {"skipped": True, "reason": "Too few segments"}

    segments_text = "\n".join(
        f'  {{"id": {s["id"]}, '
        f'"speaker": "{s.get("speaker", "?")}",  '
        f'"text": "{str(s.get("text", "")).strip()}"}}'
        for s in window
    )

    prompt = _PROMPT.format(
        context_block=_context_block(context),
        segments_text=segments_text,
    )

    try:
        from groq import Groq

        client = Groq(api_key=Config.GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=Config.GROQ_DIARIZE_MODEL,   # llama-3.3-70b-versatile
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=600,
            temperature=0,
        )
        raw     = (resp.choices[0].message.content or "").strip()
        corrs   = _parse(raw)
        new_ctx = _update_context(window, corrs, context)

        print(
            f"[llm_correct] {len(corrs)} corrections  "
            f"ctx=({new_ctx.get('doctor_label')} → Doctor, "
            f"{new_ctx.get('patient_label')} → Patient)"
        )
        return {"corrections": corrs, "context": new_ctx}

    except json.JSONDecodeError as e:
        print(f"[llm_correct] JSON parse error: {e}")
        return {"error": "Model returned invalid JSON"}
    except Exception as e:
        print(f"[llm_correct] Error: {e}")
        return {"error": str(e)}
