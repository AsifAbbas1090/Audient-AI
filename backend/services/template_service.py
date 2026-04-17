"""
Template bootstrap, validation, and lookup helpers.
"""
from __future__ import annotations

import re
from typing import Any

from extensions import db
from models.template import DoctorTemplate, DoctorTemplateVersion
from models.user import User
from services.specialty_service import normalize_specialty
from services.pdf_theme import default_theme_dict, validate_clean_theme

# Known Summary / PDF / UI source keys (plus transcript block).
_ALLOWED_SOURCE_KEYS = frozenset({
    "patient_name",
    "patient_age",
    "patient_gender",
    "disease",
    "education",
    "emotional_state",
    "additional_notes",
    "follow_up_questions",
    "transcript",
    "patient_facing_summary",
})

TEMPLATE_PURPOSES = frozenset({"clinical", "patient_facing"})

# Custom keys stored in extracted_entities JSON: snake_case, 1–64 chars.
_CUSTOM_SOURCE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

_MAX_SECTIONS = 40


def default_template_schema(specialty: str) -> dict[str, Any]:
    # Keep source keys aligned with existing Summary fields to avoid breaking current data flow.
    spec = normalize_specialty(specialty)

    disease_label = {
        "cardiology": "CV diagnosis / chief cardiac concern",
        "psychiatry": "Primary psychiatric diagnosis / concern",
        "paediatrics": "Diagnosis / developmental concern",
        "general_practice": "Reason for visit / working diagnosis",
        "general_mbbs": "Condition / Diagnosis",
    }.get(spec, "Condition / Diagnosis")

    notes_label = {
        "psychiatry": "MSE, risk, medications, plan",
        "cardiology": "Meds, vitals, tests, procedures, plan",
        "paediatrics": "Growth, immunizations, caregiver instructions",
        "general_practice": "Chronic problems, referrals, patient goals",
    }.get(spec, "Additional Notes")

    follow_label = {
        "psychiatry": "Risk review & follow-up questions",
        "cardiology": "CV follow-up questions",
        "paediatrics": "Paediatric follow-up questions",
    }.get(spec, "Follow-up Questions")

    emotional_visible = spec == "psychiatry"
    education_visible = spec in ("paediatrics", "general_mbbs", "general_practice")

    base_sections = [
        {"id": "patient_name", "label": "Patient Name", "source_key": "patient_name", "visible": True},
        {"id": "patient_age", "label": "Age", "source_key": "patient_age", "visible": True},
        {"id": "patient_gender", "label": "Gender", "source_key": "patient_gender", "visible": True},
        {"id": "disease", "label": disease_label, "source_key": "disease", "visible": True},
        {"id": "emotional_state", "label": "Emotional State / MSE cues", "source_key": "emotional_state", "visible": emotional_visible},
        {"id": "education", "label": "Education", "source_key": "education", "visible": education_visible},
        {"id": "additional_notes", "label": notes_label, "source_key": "additional_notes", "visible": True},
        {"id": "follow_up_questions", "label": follow_label, "source_key": "follow_up_questions", "visible": True},
        {"id": "transcript", "label": "Transcript", "source_key": "transcript", "visible": False},
    ]
    return {"sections": base_sections, "theme": default_theme_dict()}


def default_patient_facing_schema(specialty: str) -> dict[str, Any]:
    """Default layout for patient-facing PDFs (plain-language block + optional identity)."""
    spec = normalize_specialty(specialty)
    pfs_label = {
        "psychiatry": "After-visit summary (supportive, clear)",
        "cardiology": "After-visit summary (heart health)",
        "paediatrics": "After-visit summary (for parents / guardians)",
        "general_practice": "After-visit summary (what we agreed today)",
        "general_mbbs": "After-visit summary (patient)",
    }.get(spec, "After-visit summary (patient)")
    return {
        "sections": [
            {
                "id": "pfs",
                "label": pfs_label,
                "source_key": "patient_facing_summary",
                "visible": True,
            },
            {
                "id": "pn",
                "label": "Name on file",
                "source_key": "patient_name",
                "visible": True,
            },
            {
                "id": "tr",
                "label": "Visit conversation (full text)",
                "source_key": "transcript",
                "visible": False,
            },
        ],
        "theme": {"layout": "classic_blue"},
    }


def normalize_purpose(raw: str | None) -> str:
    v = (raw or "clinical").strip().lower()
    return v if v in TEMPLATE_PURPOSES else "clinical"


def validate_schema(schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(schema, dict):
        raise ValueError("schema_json must be an object")
    sections = schema.get("sections")
    if not isinstance(sections, list) or not sections:
        raise ValueError("schema_json.sections must be a non-empty array")
    if len(sections) > _MAX_SECTIONS:
        raise ValueError(f"At most {_MAX_SECTIONS} sections are allowed")

    clean_sections: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for i, sec in enumerate(sections):
        if not isinstance(sec, dict):
            raise ValueError(f"Section at index {i} must be an object")

        source_key = str(sec.get("source_key") or "").strip()
        if not source_key:
            raise ValueError(f"Section at index {i}: source_key is required")

        if source_key not in _ALLOWED_SOURCE_KEYS:
            if not _CUSTOM_SOURCE_KEY_RE.match(source_key):
                raise ValueError(
                    f"Section at index {i}: invalid source_key {source_key!r}. "
                    "Use a built-in key or a custom snake_case identifier (e.g. custom_allergy)."
                )

        sec_id = str(sec.get("id") or source_key).strip()[:120]
        if not sec_id:
            raise ValueError(f"Section at index {i}: id cannot be empty")
        if sec_id in seen_ids:
            raise ValueError(f"Duplicate section id: {sec_id!r}")
        seen_ids.add(sec_id)

        label = str(sec.get("label") or "").strip()[:120]
        if not label:
            label = source_key.replace("_", " ").title()[:120]

        clean_sections.append({
            "id": sec_id,
            "label": label,
            "source_key": source_key,
            "visible": bool(sec.get("visible", True)),
        })

    # At least one visible section recommended; allow all hidden only if intentional
    if not any(s["visible"] for s in clean_sections):
        raise ValueError("At least one section must be visible")

    clean_theme = validate_clean_theme(schema.get("theme"))
    return {"sections": clean_sections, "theme": clean_theme}


def validate_schema_for_draft(schema: dict[str, Any]) -> dict[str, Any]:
    """Lenient validation for saving work-in-progress drafts (incomplete source_key allowed)."""
    if not isinstance(schema, dict):
        raise ValueError("schema_json must be an object")
    sections = schema.get("sections")
    if not isinstance(sections, list) or not sections:
        raise ValueError("schema_json.sections must be a non-empty array")
    if len(sections) > _MAX_SECTIONS:
        raise ValueError(f"At most {_MAX_SECTIONS} sections are allowed")

    clean_sections: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for i, sec in enumerate(sections):
        if not isinstance(sec, dict):
            raise ValueError(f"Section at index {i} must be an object")

        source_key = str(sec.get("source_key") or "").strip()
        if source_key and source_key not in _ALLOWED_SOURCE_KEYS:
            if not _CUSTOM_SOURCE_KEY_RE.match(source_key):
                raise ValueError(
                    f"Section at index {i}: invalid source_key {source_key!r}. "
                    "Use a built-in key or a custom snake_case identifier."
                )

        sec_id = str(sec.get("id") or source_key or f"section_{i + 1}").strip()[:120]
        if not sec_id:
            sec_id = f"section_{i + 1}"
        if sec_id in seen_ids:
            raise ValueError(f"Duplicate section id: {sec_id!r}")
        seen_ids.add(sec_id)

        label = str(sec.get("label") or "").strip()[:120]
        if not label and source_key:
            label = source_key.replace("_", " ").title()[:120]
        if not label:
            label = f"Section {i + 1}"

        clean_sections.append({
            "id": sec_id,
            "label": label,
            "source_key": source_key,
            "visible": bool(sec.get("visible", True)),
        })

    clean_theme = validate_clean_theme(schema.get("theme"))
    return {"sections": clean_sections, "theme": clean_theme}


def build_branding_snapshot(user: User) -> dict[str, Any]:
    return {
        "doctor_name": user.name,
        "doctor_title": user.doctor_title,
        "clinic_name": user.clinic_name,
        "license_number": user.license_number,
        "signature_url": user.signature_url,
        "logo_url": user.logo_url,
        "specialty": user.specialty,
    }


def get_or_create_user_template(user: User, purpose: str = "clinical") -> DoctorTemplate:
    purpose = normalize_purpose(purpose)
    tmpl = DoctorTemplate.query.filter_by(user_id=user.id, purpose=purpose).first()
    if tmpl:
        return tmpl

    spec = user.specialty or "general_mbbs"
    if purpose == "patient_facing":
        schema = default_patient_facing_schema(spec)
        name = "Patient-facing summary"
    else:
        schema = default_template_schema(spec)
        name = "My Clinical Template"

    tmpl = DoctorTemplate(
        user_id=user.id,
        purpose=purpose,
        specialty_base=spec,
        schema_json=schema,
        name=name,
    )
    db.session.add(tmpl)
    db.session.flush()

    version = DoctorTemplateVersion(
        template_id=tmpl.id,
        version_number=1,
        schema_json=schema,
        branding_snapshot_json=build_branding_snapshot(user),
    )
    db.session.add(version)
    db.session.flush()
    tmpl.active_version_id = version.id
    db.session.flush()
    return tmpl


def get_active_template_version_id(user_id: str | None, purpose: str = "clinical") -> str | None:
    if not user_id:
        return None
    user = User.query.get(user_id)
    if not user:
        return None
    purpose = normalize_purpose(purpose)
    tmpl = get_or_create_user_template(user, purpose=purpose)
    if not tmpl.active_version_id:
        # Defensive: publish from current draft if active missing.
        spec = user.specialty or "general_mbbs"
        fallback_schema = (
            default_patient_facing_schema(spec)
            if purpose == "patient_facing"
            else default_template_schema(spec)
        )
        version = DoctorTemplateVersion(
            template_id=tmpl.id,
            version_number=1,
            schema_json=tmpl.schema_json or fallback_schema,
            branding_snapshot_json=build_branding_snapshot(user),
        )
        db.session.add(version)
        db.session.flush()
        tmpl.active_version_id = version.id
        db.session.flush()
    return tmpl.active_version_id
