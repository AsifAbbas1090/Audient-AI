"""
Doctor template APIs (MVP versioned template builder backend).
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, g

from extensions import db
from models.template import DoctorTemplateVersion
from models.user import User
from services.template_service import (
    get_or_create_user_template,
    validate_schema,
    validate_schema_for_draft,
    build_branding_snapshot,
)
from utils.auth import require_auth

templates_bp = Blueprint("templates", __name__, url_prefix="/api/templates")


@templates_bp.route("/me", methods=["GET"])
@require_auth
def get_my_template():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    tmpl = get_or_create_user_template(user)
    versions = [
        v.to_dict()
        for v in DoctorTemplateVersion.query.filter_by(template_id=tmpl.id)
        .order_by(DoctorTemplateVersion.version_number.desc())
        .all()
    ]
    return jsonify({
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
    tmpl = get_or_create_user_template(user)

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

    return jsonify({"template": tmpl.to_dict()}), 200


@templates_bp.route("/me/publish", methods=["POST"])
@require_auth
def publish_my_template():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    tmpl = get_or_create_user_template(user)

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
    tmpl = get_or_create_user_template(user)
    version = DoctorTemplateVersion.query.filter_by(id=version_id, template_id=tmpl.id).first()
    if not version:
        return jsonify({"error": "Template version not found"}), 404

    try:
        tmpl.active_version_id = version.id
        db.session.commit()
        return jsonify({"template": tmpl.to_dict(), "active_version": version.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
