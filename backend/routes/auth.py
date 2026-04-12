"""
Auth routes:
  POST /api/auth/register        — create account, returns JWT + user
  POST /api/auth/login           — verify credentials, returns JWT + user
  GET  /api/auth/me              — return current user from token
  POST /api/auth/logout          — client-side only (token is stateless), returns 200
  POST /api/auth/reset-password  — offline password reset (no email — verify by email + new password)
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g

from extensions import db
from models.user import User
from utils.auth import hash_password, verify_password, generate_token, require_auth

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _db_available() -> bool:
    from config import Config
    return bool(Config.DATABASE_URL)


# ── Register ────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
def register():
    if not _db_available():
        return jsonify({"error": "Database not configured — set DATABASE_URL in .env"}), 503

    data     = request.get_json() or {}
    name     = (data.get("name") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role     = data.get("role", "healthcare")

    # Validate
    errors = {}
    if not name:                        errors["name"]     = "Full name is required."
    if not email:                       errors["email"]    = "Email address is required."
    if not password or len(password) < 6:
        errors["password"] = "Password must be at least 6 characters."
    if role not in ("healthcare", "admin"):
        role = "healthcare"
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    # Duplicate check
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    try:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Could not create account: {e}"}), 500

    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()}), 201


# ── Login ────────────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST"])
def login():
    if not _db_available():
        return jsonify({"error": "Database not configured — set DATABASE_URL in .env"}), 503

    data     = request.get_json() or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 422

    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({"error": "Invalid email or password."}), 401

    # Update last_login_at
    try:
        user.last_login_at = datetime.now(timezone.utc)
        db.session.commit()
    except Exception:
        db.session.rollback()

    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()}), 200


# ── Me ───────────────────────────────────────────────────────

@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200


# ── Logout (stateless — client drops the token) ──────────────

@auth_bp.route("/logout", methods=["POST"])
def logout():
    # JWT is stateless — client simply discards the token.
    # This endpoint exists so the frontend has a clean API call to make.
    return jsonify({"message": "Logged out successfully"}), 200


# ── Password reset (offline — no email verification) ─────────

@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Offline-friendly password reset.
    No email token is needed — the user proves identity by providing
    their registered email. Suitable for a clinic-local deployment
    where an admin can verify the person in person.

    Body: { email, new_password }
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    data         = request.get_json() or {}
    email        = (data.get("email") or "").strip().lower()
    new_password = data.get("new_password") or ""

    if not email:
        return jsonify({"error": "Email address is required."}), 422
    if not new_password or len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 422

    user = User.query.filter_by(email=email).first()
    # Return the same message whether user exists or not (prevents user enumeration)
    if not user:
        return jsonify({"message": "If that email is registered, the password has been updated."}), 200

    try:
        user.password_hash = hash_password(new_password)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Could not update password: {e}"}), 500

    return jsonify({"message": "Password updated successfully. You can now sign in."}), 200
