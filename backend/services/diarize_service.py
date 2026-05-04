"""
Diarization service.
Online  mode (default): Groq LLM infers Doctor/Patient from transcript context.
Offline mode (optional): set HF_TOKEN in .env + install pyannote.audio for
                          audio-based diarization (more accurate, works per-chunk).
"""
import json
import re
import threading
from typing import List, Dict, Any, Optional

_pyannote_ready_event = threading.Event()
_pyannote_load_lock = threading.Lock()


def expand_segments_for_diarization(
    segments: List[Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], List[int]]:
    """
    Split multi-sentence segments into one-sentence units with interpolated
    timestamps. Returns (expanded_rows, group_sizes) where sum(group_sizes)
    == len(expanded_rows) and len(group_sizes) == len(segments).

    Callers label `expanded_rows` with the LLM, then collapse with
    `collapse_labeled_segments` so the client/DB keep original segment granularity.
    """
    import re

    result: List[Dict[str, Any]] = []
    sizes: List[int] = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        sentences = re.split(r'(?<=[.?!])\s+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        if len(sentences) <= 1:
            result.append(seg)
            sizes.append(1)
        else:
            start = float(seg.get("start") or 0)
            end = float(seg.get("end") or 0)
            dur = (end - start) / len(sentences)
            for i, sentence in enumerate(sentences):
                result.append({
                    **seg,
                    "text": sentence,
                    "start": round(start + i * dur, 3),
                    "end": round(start + (i + 1) * dur, 3),
                })
            sizes.append(len(sentences))
    return result, sizes


def split_segments_by_sentence(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Split multi-sentence segments for LLM diarization (expanded list only).
    Prefer `expand_segments_for_diarization` + `collapse_labeled_segments` when
    you need to map labels back to the original segment list.
    """
    expanded, _ = expand_segments_for_diarization(segments)
    return expanded


def collapse_labeled_segments(
    original: List[Dict[str, Any]],
    expanded_labeled: List[Dict[str, Any]],
    group_sizes: List[int],
) -> List[Dict[str, Any]]:
    """
    Merge per-sentence LLM labels back onto the pre-expand segments using
    length-weighted majority vote within each group.
    """
    if len(original) != len(group_sizes) or sum(group_sizes) != len(expanded_labeled):
        print(
            f"[Diarize/collapse] mismatch orig={len(original)} sizes_sum={sum(group_sizes)} "
            f"expanded={len(expanded_labeled)} — returning original speakers unchanged"
        )
        return [dict(s) for s in original]

    out: List[Dict[str, Any]] = []
    j = 0
    for orig, sz in zip(original, group_sizes):
        chunk = expanded_labeled[j : j + sz]
        j += sz
        speaker = _majority_speaker_labels(chunk)
        merged = dict(orig)
        merged["speaker"] = speaker
        out.append(merged)
    return out


def _majority_speaker_labels(subsegs: List[Dict[str, Any]]) -> str:
    doc_score = 0.0
    pat_score = 0.0
    for s in subsegs:
        w = float(max(len((s.get("text") or "").strip()), 1))
        role = (s.get("speaker") or "").lower()
        if "patient" in role:
            pat_score += w
        else:
            doc_score += w
    return "Patient" if pat_score > doc_score else "Doctor"


_DIARIZE_SYSTEM = (
    "You are a clinical transcription analyst. "
    "Identify speakers in medical consultations. Reply only with valid JSON."
)

_DIARIZE_PROMPT = """\
Doctor-patient medical consultation. Assign each segment to "Doctor" or "Patient".

DOCTOR speaks like:
  • Clinical terms: diagnosis, prescription, dosage, CBC, ECG, referral, hypertension, diabetes
  • Directed questions: "How long have you had this?", "Any allergies?", "Where is the pain?"
  • Instructions: "Take twice daily", "Avoid spicy food", "Come back in a week"
  • Interpreting results: "Your BP is elevated", "The scan shows...", "Blood work is normal"
  • Usually speaks FIRST and leads the conversation

PATIENT speaks like:
  • Symptoms: "I've been feeling...", "It started...", "The pain is here"
  • Answers: "Yes doctor", "About 3 days", "No I haven't taken anything"
  • Concerns: "Will it get better?", "Is it serious?", "Can I go to work?"
  • Personal history: "I had this before", "I'm diabetic", "My mother had..."

{context_block}

Return ONLY a JSON array — no explanation, no markdown:
[{{"id": <number>, "speaker": "Doctor" | "Patient"}}, ...]

Segments:
{segments_text}"""

_CTX_ESTABLISHED = (
    "ESTABLISHED CONTEXT from earlier in this session:\n"
    "  Doctor said things like: {doctor_samples}\n"
    "  Patient said things like: {patient_samples}\n"
    "Use these to maintain speaker consistency."
)
_CTX_COLD = (
    "CONTEXT: First pass — infer Doctor vs Patient purely from clinical language and turn-taking."
)


def _build_context_block(prior_labels: Optional[Dict]) -> str:
    if not prior_labels:
        return _CTX_COLD
    doc = [t for t in (prior_labels.get("doctor") or []) if t.strip()]
    pat = [t for t in (prior_labels.get("patient") or []) if t.strip()]
    if not doc and not pat:
        return _CTX_COLD
    return _CTX_ESTABLISHED.format(
        doctor_samples="; ".join(f'"{t[:60]}"' for t in doc[:3]),
        patient_samples="; ".join(f'"{t[:60]}"' for t in pat[:3]),
    )


def diarize_with_groq(
    segments: List[Dict[str, Any]],
    prior_labels: Optional[Dict] = None,
    session_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Use Groq LLM (70B) to assign Doctor/Patient speaker labels from transcript text.

    Args:
        segments:     list of {text, start, end, speaker, ...}
        prior_labels: optional {"doctor": [example texts], "patient": [example texts]}
                      built up across successive calls within a session for consistency.

    Returns segments with speaker set to "Doctor" or "Patient".
    Falls back to original segments on any error.
    """
    from config import Config

    if not Config.GROQ_API_KEYS_LIST:
        return segments

    text_segs = [s for s in segments if (s.get("text") or "").strip()]
    if len(text_segs) < 2:
        return segments

    try:
        # Build numbered segment list with stable IDs for robust parsing
        seg_ids   = list(range(1, len(text_segs) + 1))
        seg_lines = "\n".join(
            f'  {{"id": {sid}, "text": "{s["text"].strip().replace(chr(34), chr(39))}"}}'
            for sid, s in zip(seg_ids, text_segs)
        )

        prompt = _DIARIZE_PROMPT.format(
            context_block=_build_context_block(prior_labels),
            segments_text=seg_lines,
        )

        from services.groq_retry import groq_call_with_key_rotation

        resp = groq_call_with_key_rotation(
            session_id,
            lambda client: client.chat.completions.create(
                model=Config.GROQ_DIARIZE_MODEL,
                messages=[
                    {"role": "system", "content": _DIARIZE_SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                max_tokens=len(text_segs) * 20 + 64,
                temperature=0,
            ),
        )
        content = (resp.choices[0].message.content or "").strip()

        # Parse [{id, speaker}] — robust to leading/trailing prose
        match = re.search(r'\[.*?\]', content, re.DOTALL)
        if not match:
            print(f"[Diarize/Groq] No JSON array in response: {content[:120]}")
            return segments

        raw: List[Dict] = json.loads(match.group())
        id_to_speaker: Dict[int, str] = {}
        for item in raw:
            sid = item.get("id")
            spk = str(item.get("speaker") or "").strip()
            if sid is not None:
                id_to_speaker[int(sid)] = "Doctor" if "doctor" in spk.lower() else "Patient"

        # Map back to original segment list (preserving empty/non-text segments)
        result   = []
        label_idx = 0
        for seg in segments:
            if (seg.get("text") or "").strip():
                label_idx += 1
                speaker = id_to_speaker.get(label_idx, "Doctor")
                result.append({**seg, "speaker": speaker})
            else:
                result.append(seg)

        print(f"[Diarize/Groq] {len(result)} segs labeled with {Config.GROQ_DIARIZE_MODEL}")
        return result

    except Exception as e:
        print(f"[Diarize/Groq] Error: {e}")
        return segments


def wait_pyannote_pipeline_ready(timeout: float | None = None) -> bool:
    """
    Block until pyannote finished loading (or failed), or timeout expires.
    When HF_TOKEN is unset, returns True immediately (Groq-only mode).
    """
    from config import Config

    if not Config.HF_TOKEN:
        return True
    if _pipeline is not None:
        return True
    return _pyannote_ready_event.wait(timeout=timeout)


def get_pipeline():
    """
    Returns pyannote pipeline if HF_TOKEN is set, else None.
    Requires: pip install pyannote.audio torch torchaudio
    """
    from config import Config

    if not Config.HF_TOKEN:
        _pyannote_ready_event.set()
        return None

    global _pipeline
    if _pipeline is not None:
        return _pipeline

    with _pyannote_load_lock:
        if _pipeline is not None:
            return _pipeline
        try:
            from pyannote.audio import Pipeline

            print("[Diarize] Loading pyannote/speaker-diarization-3.1 ...")
            _pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                token=Config.HF_TOKEN,
            )
            print("[Diarize] Pipeline ready.")
            return _pipeline
        except ImportError:
            print("[Diarize] pyannote.audio not installed — diarization unavailable.")
            _pipeline = None
            return None
        except Exception as e:
            print(f"[Diarize] pyannote load failed: {e}")
            _pipeline = None
            return None
        finally:
            _pyannote_ready_event.set()


_pipeline = None


def diarize(waveform, sample_rate: int, min_speakers: int = 1, max_speakers: int = 2):
    """Run diarization. Returns pyannote Annotation or None."""
    pipeline = get_pipeline()
    if pipeline is None:
        return None
    audio_input = {"waveform": waveform, "sample_rate": sample_rate}
    return pipeline(audio_input, min_speakers=min_speakers, max_speakers=max_speakers)


def assign_speakers(
    segments: List[Dict[str, Any]],
    diarization,
    speaker_map: Optional[Dict[str, str]] = None,
) -> tuple:
    """Assign speaker labels to transcript segments by timestamp."""
    if speaker_map is None:
        speaker_map = {}

    timeline = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        timeline.append({"start": turn.start, "end": turn.end, "speaker": speaker})

    result = []
    for seg in segments:
        mid        = (seg.get("start", 0) + seg.get("end", 0)) / 2
        raw_speaker = "SPEAKER_00"
        for t in timeline:
            if t["start"] <= mid <= t["end"]:
                raw_speaker = t["speaker"]
                break
        if raw_speaker not in speaker_map:
            speaker_map[raw_speaker] = f"Speaker {len(speaker_map) + 1}"
        result.append({**seg, "speaker": speaker_map[raw_speaker]})

    return result, speaker_map
