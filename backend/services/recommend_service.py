"""
Clinical Recommendation Service (Phase 3).

Calls Groq LLaMA to generate AI clinical insights from a session's
transcript text + extracted medical fields.

Returns a dict with these keys (all lists/strings, never null):
  differential_diagnosis  — list[str]
  suggested_tests         — list[str]
  treatment_suggestions   — list[str]
  followup_notes          — str
  risk_flags              — list[str]   (empty list if none)
"""
import json
import re
from typing import Any, Dict


SYSTEM_MSG = (
    "You are a clinical decision-support assistant. "
    "You help healthcare professionals by suggesting possible diagnoses, tests, "
    "and treatment considerations based on a patient consultation transcript. "
    "You do NOT replace a physician — always note that recommendations require "
    "professional clinical judgment. Respond ONLY with a raw JSON object."
)

PROMPT_TEMPLATE = """Below is a medical consultation transcript and extracted patient data.
Generate clinical insights to assist the treating physician.

--- PATIENT DATA ---
Name:            {patient_name}
Age:             {patient_age}
Gender:          {patient_gender}
Reported Disease/Complaint: {disease}
Emotional State: {emotional_state}
Additional Notes: {additional_notes}

--- TRANSCRIPT ---
{transcript}

--- SPECIALTY CONTEXT ---
{specialty_context}

--- INSTRUCTIONS ---
Return ONLY a valid JSON object with exactly these keys:
{{
  "differential_diagnosis": ["condition 1", "condition 2", ...],
  "suggested_tests":        ["test 1", "test 2", ...],
  "treatment_suggestions":  ["suggestion 1", ...],
  "followup_notes":         "plain string with follow-up advice",
  "risk_flags":             ["flag 1", ...] or []
}}

Rules:
- Each list must have 2–5 concise items (one short sentence each).
- followup_notes must be a single string (2–3 sentences).
- risk_flags: only include if there are genuine clinical risk factors; otherwise return [].
- Do NOT include markdown, code fences, or any text outside the JSON object.
"""


def _parse(content: str) -> Dict[str, Any]:
    """Strip markdown fences and parse JSON."""
    content = content.strip()
    # Remove ```json ... ``` or ``` ... ```
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


def _safe_str(val) -> str:
    if val is None:
        return "Not provided"
    s = str(val).strip()
    return s if s else "Not provided"


def generate_recommendations(
    transcript_text: str,
    summary: dict,
    specialty: str | None = None,
) -> Dict[str, Any]:
    """
    Generate clinical recommendations using Groq LLaMA.

    Args:
        transcript_text: raw transcript string
        summary:         dict from Summary.to_dict() (or subset)

    Returns:
        dict with differential_diagnosis, suggested_tests,
        treatment_suggestions, followup_notes, risk_flags.
    Raises:
        RuntimeError if Groq is unavailable or returns invalid JSON.
    """
    from config import Config
    from groq import Groq
    from services.specialty_service import specialty_prompt_block

    if not Config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set — cannot generate recommendations.")

    prompt = PROMPT_TEMPLATE.format(
        patient_name    =_safe_str(summary.get("patient_name")),
        patient_age     =_safe_str(summary.get("patient_age")),
        patient_gender  =_safe_str(summary.get("patient_gender")),
        disease         =_safe_str(summary.get("disease")),
        emotional_state =_safe_str(summary.get("emotional_state")),
        additional_notes=_safe_str(summary.get("additional_notes")),
        transcript      =(transcript_text or "").strip() or "No transcript available.",
        specialty_context=specialty_prompt_block(specialty),
    )

    client = Groq(api_key=Config.GROQ_API_KEY)
    completion = client.chat.completions.create(
        model=Config.GROQ_EXTRACT_MODEL,   # llama-3.1-8b-instant
        messages=[
            {"role": "system", "content": SYSTEM_MSG},
            {"role": "user",   "content": prompt},
        ],
        max_tokens=1024,
        temperature=0.3,
    )

    content = (completion.choices[0].message.content or "").strip()
    print(f"[Recommend] raw response length={len(content)}")

    try:
        result = _parse(content)
    except json.JSONDecodeError as e:
        print(f"[Recommend] JSON parse error: {e}\nRaw: {content[:300]}")
        raise RuntimeError(f"Model returned invalid JSON: {e}") from e

    # Normalise — guarantee expected keys exist
    return {
        "differential_diagnosis": result.get("differential_diagnosis") or [],
        "suggested_tests":        result.get("suggested_tests")        or [],
        "treatment_suggestions":  result.get("treatment_suggestions")  or [],
        "followup_notes":         result.get("followup_notes")         or "",
        "risk_flags":             result.get("risk_flags")             or [],
    }
