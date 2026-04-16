"""
Template bootstrap, validation, and lookup helpers.
"""
from __future__ import annotations

import re
from typing import Any

from extensions import db
from models.template import DoctorTemplate, DoctorTemplateVersion
from models.user import User

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
})

# Custom keys stored in extracted_entities JSON: snake_case, 1–64 chars.
_CUSTOM_SOURCE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

_MAX_SECTIONS = 40


def default_template_schema(specialty: str) -> dict[str, Any]:
    # Keep source keys aligned with existing Summary fields to avoid breaking current data flow.
    base_sections = [
        {"id": "patient_name", "label": "Patient Name", "source_key": "patient_name", "visible": True},
        {"id": "patient_age", "label": "Age", "source_key": "patient_age", "visible": True},
        {"id": "patient_gender", "label": "Gender", "source_key": "patient_gender", "visible": True},
        {"id": "disease", "label": "Condition / Diagnosis", "source_key": "disease", "visible": True},
        {"id": "emotional_state", "label": "Emotional State", "source_key": "emotional_state", "visible": specialty == "psychiatry"},
        {"id": "education", "label": "Education", "source_key": "education", "visible": specialty in ("paediatrics", "general_mbbs")},
        {"id": "additional_notes", "label": "Additional Notes", "source_key": "additional_notes", "visible": True},
        {"id": "follow_up_questions", "label": "Follow-up Questions", "source_key": "follow_up_questions", "visible": True},
        {"id": "transcript", "label": "Transcript", "source_key": "transcript", "visible": True},
    ]
    return {"sections": base_sections}


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

    return {"sections": clean_sections}


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

    return {"sections": clean_sections}


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


def get_or_create_user_template(user: User) -> DoctorTemplate:
    tmpl = DoctorTemplate.query.filter_by(user_id=user.id).first()
    if tmpl:
        return tmpl

    schema = default_template_schema(user.specialty or "general_mbbs")
    tmpl = DoctorTemplate(
        user_id=user.id,
        specialty_base=user.specialty or "general_mbbs",
        schema_json=schema,
        name="My Clinical Template",
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


def get_active_template_version_id(user_id: str | None) -> str | None:
    if not user_id:
        return None
    user = User.query.get(user_id)
    if not user:
        return None
    tmpl = get_or_create_user_template(user)
    if not tmpl.active_version_id:
        # Defensive: publish from current draft if active missing.
        version = DoctorTemplateVersion(
            template_id=tmpl.id,
            version_number=1,
            schema_json=tmpl.schema_json or default_template_schema(user.specialty or "general_mbbs"),
            branding_snapshot_json=build_branding_snapshot(user),
        )
        db.session.add(version)
        db.session.flush()
        tmpl.active_version_id = version.id
        db.session.flush()
    return tmpl.active_version_id
