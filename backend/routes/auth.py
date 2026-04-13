"""
Auth routes:
  POST /api/auth/register        — create account, returns access JWT + sets refresh cookie
  POST /api/auth/login           — verify credentials, returns access JWT + sets refresh cookie
  GET  /api/auth/me              — return current user from access token
  POST /api/auth/refresh         — issue new access token from httpOnly refresh cookie
  POST /api/auth/logout          — revoke all refresh tokens (bump token_version) + clear cookie
  POST /api/auth/reset-password  — offline password reset (no email required)
"""
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, g, make_response

from extensions import db, limiter
from models.user import User
from utils.auth import (
    hash_password, verify_password,
    generate_access_token, generate_refresh_token, decode_token,
    require_auth, optional_auth,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _db_available() -> bool:
    from config import Config
    return bool(Config.DATABASE_URL)


def _set_refresh_cookie(response, token: str) -> None:
    """
    Attach an httpOnly SameSite=Lax refresh-token cookie to the response.
    The path is scoped to /api/auth so the cookie is only sent to auth endpoints.
    """
    from config import Config
    max_age = int(timedelta(days=Config.JWT_REFRESH_EXPIRY_DAYS).total_seconds())
    response.set_cookie(
        "refresh_token",
        value    = token,
        max_age  = max_age,
        httponly = True,
        secure   = False,           # set True in production (HTTPS only)
        samesite = "Lax",
        path     = "/api/auth",     # cookie is only sent to /api/auth/* paths
    )


# ── Register ──────────────────────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
@limiter.limit("5 per minute", error_message="Too many registration attempts — please wait a minute.")
def register():
    if not _db_available():
        return jsonify({"error": "Database not configured — set DATABASE_URL in .env"}), 503

    data     = request.get_json() or {}
    name     = (data.get("name") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role     = data.get("role", "healthcare")

    errors = {}
    if not name:
        errors["name"]     = "Full name is required."
    if not email:
        errors["email"]    = "Email address is required."
    if not password or len(password) < 6:
        errors["password"] = "Password must be at least 6 characters."
    if role not in ("healthcare", "admin"):
        role = "healthcare"
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    try:
        user = User(
            name          = name,
            email         = email,
            password_hash = hash_password(password),
            role          = role,
        )
        db.session.add(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Could not create account: {e}"}), 500

    access  = generate_access_token(user)
    refresh = generate_refresh_token(user)
    resp    = make_response(jsonify({"token": access, "user": user.to_dict()}), 201)
    _set_refresh_cookie(resp, refresh)
    return resp


# ── Login ──────────────────────────────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute", error_message="Too many login attempts — please wait a minute.")
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

    try:
        user.last_login_at = datetime.now(timezone.utc)
        db.session.commit()
    except Exception:
        db.session.rollback()

    access  = generate_access_token(user)
    refresh = generate_refresh_token(user)
    resp    = make_response(jsonify({"token": access, "user": user.to_dict()}), 200)
    _set_refresh_cookie(resp, refresh)
    return resp


# ── Refresh ────────────────────────────────────────────────────────────────────

@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    """
    Issue a new access token using the httpOnly refresh cookie.
    Also rolls the refresh cookie (resets its expiry on activity).

    Returns 401 if:
      - no cookie present
      - token is expired or forged
      - user called /logout (token_version mismatch)
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    token = request.cookies.get("refresh_token")
    if not token:
        return jsonify({"error": "No refresh token — please log in again"}), 401

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        return jsonify({"error": "Invalid or expired refresh token"}), 401

    user = User.query.get(payload["user_id"])
    if not user:
        return jsonify({"error": "User not found"}), 401

    # token_version check: /logout bumps this, invalidating all prior refresh tokens
    if payload.get("token_version", 0) != user.token_version:
        return jsonify({"error": "Session revoked — please log in again"}), 401

    new_access  = generate_access_token(user)
    new_refresh = generate_refresh_token(user)   # rolling: extends expiry on activity

    resp = make_response(jsonify({"token": new_access, "user": user.to_dict()}), 200)
    _set_refresh_cookie(resp, new_refresh)
    return resp


# ── Me ─────────────────────────────────────────────────────────────────────────

@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    user = User.query.get(g.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200


# ── Logout ─────────────────────────────────────────────────────────────────────

@auth_bp.route("/logout", methods=["POST"])
@optional_auth
def logout():
    """
    Bump token_version (invalidates ALL outstanding refresh tokens for this user)
    and clear the refresh cookie from the browser.

    Uses @optional_auth so it succeeds even when the access token has already
    expired — the user can always log out regardless of token state.
    """
    if g.user_id:
        try:
            user = User.query.get(g.user_id)
            if user:
                user.token_version = (user.token_version or 0) + 1
                db.session.commit()
        except Exception:
            db.session.rollback()

    resp = make_response(jsonify({"message": "Logged out successfully"}), 200)
    resp.delete_cookie("refresh_token", path="/api/auth")
    return resp


# ── Password reset (offline — no email verification) ──────────────────────────

@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Offline-friendly password reset.
    No email token needed — suitable for clinic-local deployments where an
    admin can verify the user in person.

    Body: { email, new_password }
    Also bumps token_version to invalidate all existing sessions.
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
        user.token_version = (user.token_version or 0) + 1   # invalidate all sessions
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Could not update password: {e}"}), 500

    return jsonify({"message": "Password updated successfully. You can now sign in."}), 200
