"""
Specialty-aware prompting helpers.
"""
from __future__ import annotations

from models.user import SPECIALTY_CHOICES

_SPECIALTY_GUIDANCE = {
    "general_mbbs": (
        "Doctor is a General MBBS clinician handling broad OPD and emergency-facing cases. "
        "Prioritize broad triage safety, red flags, immediate stabilization clues, and practical next steps."
    ),
    "general_practice": (
        "Doctor is in General Practice. Prioritize first-contact concerns, chronic disease follow-up, "
        "preventive care, and practical outpatient continuity."
    ),
    "cardiology": (
        "Doctor is a Cardiologist. Prioritize cardiac symptoms, risk factors, vitals trends, "
        "ischemic/arrhythmic risk, and cardiology-relevant tests."
    ),
    "psychiatry": (
        "Doctor is a Psychiatrist. Prioritize mood, affect, thought content, sleep, substance use, "
        "safety concerns, adherence, and psychosocial context."
    ),
    "paediatrics": (
        "Doctor is a Paediatrician. Prioritize child age context, caregiver-reported history, growth/development, "
        "immunization relevance, and paediatric safety red flags."
    ),
}


def normalize_specialty(raw: str | None) -> str:
    if not raw:
        return "general_mbbs"
    key = str(raw).strip().lower().replace(" ", "_")
    return key if key in SPECIALTY_CHOICES else "general_mbbs"


def specialty_prompt_block(raw: str | None) -> str:
    key = normalize_specialty(raw)
    return f"Specialty: {key}\nGuidance: {_SPECIALTY_GUIDANCE.get(key, _SPECIALTY_GUIDANCE['general_mbbs'])}"
