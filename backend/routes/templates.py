"""
Doctor template APIs (MVP versioned template builder backend).

Query param `purpose`: `clinical` (default) or `patient_facing` for the second template track.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, g, Response

from extensions import db
from models.template import DoctorTemplateVersion
from models.user import User
from services.pdf_service import generate_template_preview_pdf
from services.pdf_theme import theme_presets_for_api
from services.template_service import (
    get_or_create_user_template,
    validate_schema,
    validate_schema_for_draft,
    build_branding_snapshot,
    normalize_purpose,
)
from utils.auth import require_auth

templates_bp = Blueprint("templates", __name__, url_prefix="/api/templates")


@templates_bp.route("/theme-presets", methods=["GET"])
def get_theme_presets():
    """PDF layout / accent presets (no auth; static catalog)."""
    return jsonify({"presets": theme_presets_for_api()}), 200


def _purpose() -> str:
    return normalize_purpose(request.args.get("purpose"))


@templates_bp.route("/me", methods=["GET"])
@require_auth
def get_my_template():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    purpose = _purpose()
    tmpl = get_or_create_user_template(user, purpose=purpose)
    db.session.commit()
    versions = [
        v.to_dict()
        for v in DoctorTemplateVersion.query.filter_by(template_id=tmpl.id)
        .order_by(DoctorTemplateVersion.version_number.desc())
        .all()
    ]
    return jsonify({
        "purpose": purpose,
        "template": tmpl.to_dict(),
        "active_version": tmpl.active_version.to_dict() if tmpl.active_version else None,
        "versions": versions,
    }), 200


@templates_bp.route("/me/draft", methods=["PATCH"])
@require_auth
def update_my_template_draft():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    purpose = _purpose()
    tmpl = get_or_create_user_template(user, purpose=purpose)

    data = request.get_json() or {}
    try:
        if "name" in data:
            tmpl.name = (str(data.get("name") or "").strip() or tmpl.name)[:255]
        if "schema_json" in data:
            tmpl.schema_json = validate_schema_for_draft(data.get("schema_json"))
        db.session.commit()
    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"purpose": purpose, "template": tmpl.to_dict()}), 200


@templates_bp.route("/me/preview-pdf", methods=["POST"])
@require_auth
def preview_template_pdf():
    """
    PDF preview of the current draft layout (sample data). Body may include schema_json;
    if omitted, uses the saved draft from the database.
    PDF kind matches template purpose: clinical → clinical PDF, patient_facing → patient PDF.
    """
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    purpose = _purpose()
    tmpl = get_or_create_user_template(user, purpose=purpose)
    db.session.commit()
    data = request.get_json() or {}

    try:
        if data.get("schema_json") is not None:
            schema = validate_schema_for_draft(data.get("schema_json"))
        else:
            schema = validate_schema_for_draft(tmpl.schema_json or {})
    except ValueError as e:
        return jsonify({"error": str(e)}), 422

    branding = build_branding_snapshot(user)
    audience_pdf = "patient" if purpose == "patient_facing" else "clinical"
    try:
        pdf_bytes = generate_template_preview_pdf(schema, branding, audience=audience_pdf)
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {e}"}), 500
    fname = "template_preview_patient.pdf" if audience_pdf == "patient" else "template_preview_clinical.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{fname}"',
            "Cache-Control": "no-store",
        },
    )


@templates_bp.route("/me/publish", methods=["POST"])
@require_auth
def publish_my_template():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    purpose = _purpose()
    tmpl = get_or_create_user_template(user, purpose=purpose)

    try:
        schema = validate_schema(tmpl.schema_json or {})
        tmpl.schema_json = schema
        latest = (
            DoctorTemplateVersion.query.filter_by(template_id=tmpl.id)
            .order_by(DoctorTemplateVersion.version_number.desc())
            .first()
        )
        next_version = 1 if not latest else latest.version_number + 1
        version = DoctorTemplateVersion(
            template_id=tmpl.id,
            version_number=next_version,
            schema_json=schema,
            branding_snapshot_json=build_branding_snapshot(user),
        )
        db.session.add(version)
        db.session.flush()
        tmpl.active_version_id = version.id
        db.session.commit()
        return jsonify({
            "purpose": purpose,
            "template": tmpl.to_dict(),
            "published_version": version.to_dict(),
        }), 201
    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@templates_bp.route("/me/activate/<string:version_id>", methods=["POST"])
@require_auth
def activate_my_version(version_id: str):
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    purpose = _purpose()
    tmpl = get_or_create_user_template(user, purpose=purpose)
    version = DoctorTemplateVersion.query.filter_by(id=version_id, template_id=tmpl.id).first()
    if not version:
        return jsonify({"error": "Template version not found"}), 404

    try:
        tmpl.active_version_id = version.id
        db.session.commit()
        return jsonify({
            "purpose": purpose,
            "template": tmpl.to_dict(),
            "active_version": version.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
