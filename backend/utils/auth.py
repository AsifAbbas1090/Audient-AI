"""
JWT auth utilities.
- hash_password / verify_password  — bcrypt wrappers
- generate_access_token            — short-lived access JWT (15 min)
- generate_refresh_token           — long-lived refresh JWT (30 days, httpOnly cookie)
- generate_token                   — backward-compat alias for generate_access_token
- decode_token                     — verify and decode any JWT
- require_auth                     — route decorator: any authenticated user
- require_admin                    — route decorator: admin only
- optional_auth                    — route decorator: sets g.user_id if token present
"""
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify, g


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ───────────────────────────────────────────────────────────────

def generate_access_token(user) -> str:
    """
    Short-lived access token (15 min by default).
    Stored in localStorage. Sent in Authorization: Bearer header.
    """
    from config import Config
    payload = {
        "user_id":       user.id,
        "email":         user.email,
        "role":          user.role,
        "name":          user.name,
        "token_version": user.token_version,
        "type":          "access",
        "exp":           datetime.now(timezone.utc) + timedelta(minutes=Config.JWT_ACCESS_EXPIRY_MINUTES),
        "iat":           datetime.now(timezone.utc),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def generate_refresh_token(user) -> str:
    """
    Long-lived refresh token (30 days by default).
    Set as an httpOnly SameSite=Lax cookie by the auth routes.
    Includes token_version so logout can revoke it.
    """
    from config import Config
    payload = {
        "user_id":       user.id,
        "token_version": user.token_version,
        "type":          "refresh",
        "exp":           datetime.now(timezone.utc) + timedelta(days=Config.JWT_REFRESH_EXPIRY_DAYS),
        "iat":           datetime.now(timezone.utc),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


# Backward-compat alias — callers that imported generate_token still work.
def generate_token(user) -> str:
    return generate_access_token(user)


def decode_token(token: str) -> dict | None:
    """
    Decode and verify a JWT (access or refresh).
    Returns the payload dict or None if invalid/expired.
    """
    from config import Config
    try:
        return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.PyJWTError:
        return None


def _extract_token() -> str | None:
    """Pull Bearer token from Authorization header."""
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


# ── Decorators ────────────────────────────────────────────────────────────────

def require_auth(f):
    """
    Decorator: requires a valid access JWT.
    Sets g.user_id, g.user_role, g.user_email, g.user_name on success.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Token expired or invalid — please log in again"}), 401

        g.user_id    = payload["user_id"]
        g.user_role  = payload["role"]
        g.user_email = payload["email"]
        g.user_name  = payload.get("name", "")
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """
    Decorator: requires a valid JWT AND admin role.
    Automatically applies require_auth logic first.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Token expired or invalid — please log in again"}), 401

        if payload.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        g.user_id    = payload["user_id"]
        g.user_role  = payload["role"]
        g.user_email = payload["email"]
        g.user_name  = payload.get("name", "")
        return f(*args, **kwargs)
    return decorated


def optional_auth(f):
    """
    Decorator: sets g.user_id if a valid token is present, but does NOT
    reject the request if there is no token. Used on transcription routes
    so unauthenticated demo use still works, and on /logout so it works
    even after the access token has expired.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if token:
            payload = decode_token(token)
            if payload:
                g.user_id    = payload.get("user_id")
                g.user_role  = payload.get("role")
                g.user_email = payload.get("email")
                g.user_name  = payload.get("name", "")
            else:
                g.user_id = g.user_role = g.user_email = g.user_name = None
        else:
            g.user_id = g.user_role = g.user_email = g.user_name = None
        return f(*args, **kwargs)
    return decorated
