"""
User preference routes for doctor specialty + branding.
"""
from __future__ import annotations

import os
from pathlib import Path

from flask import Blueprint, jsonify, request, g
from werkzeug.utils import secure_filename

from config import Config
from extensions import db
from models.user import User, SPECIALTY_CHOICES
from utils.auth import require_auth

users_bp = Blueprint("users", __name__, url_prefix="/api/users")

_UPLOAD_MAX_BYTES = 2 * 1024 * 1024  # 2MB
_ALLOWED_ASSET_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def _clean_text(value, max_len: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_len]


def _normalize_specialty(raw: str | None) -> str:
    if not raw:
        return "general_mbbs"
    key = str(raw).strip().lower().replace(" ", "_")
    return key if key in SPECIALTY_CHOICES else "general_mbbs"


@users_bp.route("/me/preferences", methods=["GET"])
@require_auth
def get_my_preferences():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "preferences": user.to_dict(),
        "specialty_choices": list(SPECIALTY_CHOICES),
    }), 200


@users_bp.route("/me/preferences", methods=["PATCH"])
@require_auth
def patch_my_preferences():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}

    if "specialty" in data:
        user.specialty = _normalize_specialty(data.get("specialty"))
    if "doctor_title" in data:
        user.doctor_title = _clean_text(data.get("doctor_title"), 255)
    if "clinic_name" in data:
        user.clinic_name = _clean_text(data.get("clinic_name"), 255)
    if "license_number" in data:
        user.license_number = _clean_text(data.get("license_number"), 120)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"preferences": user.to_dict()}), 200


@users_bp.route("/me/preferences/assets", methods=["POST"])
@require_auth
def upload_branding_asset():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    asset_type = (request.form.get("asset_type") or "").strip().lower()
    if asset_type not in {"signature", "logo"}:
        return jsonify({"error": "asset_type must be 'signature' or 'logo'"}), 422

    if "file" not in request.files:
        return jsonify({"error": "file is required"}), 400

    file = request.files["file"]
    filename = secure_filename(file.filename or "")
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_ASSET_EXT:
        return jsonify({"error": "Only png/jpg/jpeg/webp files are allowed"}), 422

    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > _UPLOAD_MAX_BYTES:
        return jsonify({"error": "File size exceeds 2MB limit"}), 422

    asset_dir = os.path.join(Config.SESSIONS_DIR, "branding", user.id)
    os.makedirs(asset_dir, exist_ok=True)
    disk_path = os.path.join(asset_dir, f"{asset_type}{ext}")
    file.save(disk_path)

    if asset_type == "signature":
        user.signature_url = disk_path
    else:
        user.logo_url = disk_path

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "asset_type": asset_type,
        "path": disk_path,
        "preferences": user.to_dict(),
    }), 201
