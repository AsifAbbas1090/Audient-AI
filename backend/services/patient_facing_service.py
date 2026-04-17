"""
Generate a plain-language, patient-facing summary for PDF / sharing.
Uses Groq when configured; falls back to a structured plain-text summary otherwise.
"""
from __future__ import annotations

import json
from typing import Any


def generate_patient_facing_summary(
    transcript_text: str,
    summary_fields: dict[str, Any],
    specialty: str | None = None,
) -> str | None:
    """
    Produce short, jargon-light text suitable for a patient to read.
    Returns None if nothing can be generated.
    """
    from config import Config

    text = (transcript_text or "").strip()
    if not text and not any(summary_fields.values()):
        return None

    from services.specialty_service import (
        normalize_specialty,
        specialty_prompt_block,
        patient_facing_tone_block,
    )

    spec       = normalize_specialty(specialty)
    spec_block = specialty_prompt_block(specialty)
    tone_block = patient_facing_tone_block(specialty)

    if not Config.GROQ_API_KEY:
        return _fallback_plain(summary_fields, spec)

    from groq import Groq

    payload = {
        "patient_name":   summary_fields.get("patient_name"),
        "patient_age":    summary_fields.get("patient_age"),
        "patient_gender": summary_fields.get("patient_gender"),
        "main_concern":   summary_fields.get("disease"),
        "notes":          summary_fields.get("additional_notes"),
    }

    prompt = f"""You are helping a clinician share a brief, appropriate after-visit summary with their patient.

{spec_block}

PATIENT-FACING TONE GUIDANCE FOR THIS SPECIALTY:
{tone_block}

Additional rules:
- Use simple language at approximately 8th-grade reading level.
- Briefly explain any medical term you must use, in parentheses.
- Do NOT provide diagnoses, prescribe medications, or give treatment instructions beyond
  reminding the patient to follow their doctor's advice.
- Do NOT reproduce any psychiatric risk assessment language.
- Keep the summary warm, reassuring, and actionable.

Structured visit hints (may be incomplete — use transcript as primary source):
{json.dumps({k: v for k, v in payload.items() if v}, indent=2)}

Consultation transcript (focus on what matters to the patient):
{text[:12000]}

Write exactly 2–4 short paragraphs in this order:
1) What was discussed during the visit, in plain words
2) What the patient should remember, watch for, or do at home
3) When to seek urgent care (specific signs in simple language)
4) Next steps — follow-up, tests, or 'as discussed with your doctor' if applicable

Return ONLY the patient-facing text — no title, no markdown headers, no bullet lists unless necessary."""

    try:
        client = Groq(api_key=Config.GROQ_API_KEY)
        completion = client.chat.completions.create(
            model=Config.GROQ_EXTRACT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write clear, kind, jargon-free patient education text. "
                        "No JSON. No markdown. No diagnostic labels unless already shared with patient."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=1000,
            temperature=0.3,
        )
        out = (completion.choices[0].message.content or "").strip()
        return out if out else _fallback_plain(summary_fields, spec)
    except Exception as e:
        print(f"[patient_facing] error: {e}")
        return _fallback_plain(summary_fields, spec)


def _fallback_plain(summary_fields: dict[str, Any], specialty: str) -> str | None:
    """
    Structured fallback when Groq is unavailable.
    Returns a minimal but meaningful patient summary built from extracted fields.
    """
    parts: list[str] = []

    name = summary_fields.get("patient_name")
    if name:
        parts.append(f"This visit summary is for {name}.")

    concern = summary_fields.get("disease")
    if concern:
        parts.append(f"Your visit was mainly about: {concern}.")

    notes = summary_fields.get("additional_notes")
    if notes:
        parts.append(str(notes))

    followups = summary_fields.get("follow_up_questions")
    if isinstance(followups, list) and followups:
        parts.append(
            "Your doctor noted the following for your next visit: "
            + "; ".join(str(q) for q in followups[:3]) + "."
        )

    if not parts:
        return None

    parts.append(
        "Please follow all the advice your clinician gave you during this visit. "
        "If you have concerns before your next appointment, contact the clinic."
    )
    return " ".join(parts)
