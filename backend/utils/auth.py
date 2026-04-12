"""
JWT auth utilities.
- hash_password / verify_password  — bcrypt wrappers
- generate_token                   — create signed JWT
- decode_token                     — verify and decode JWT
- require_auth                     — route decorator: any authenticated user
- require_admin                    — route decorator: admin only
"""
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from functools import wraps
from flask import request, jsonify, g


# ── Password helpers ─────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ──────────────────────────────────────────────

def generate_token(user) -> str:
    """Generate a signed JWT for the given User ORM instance."""
    from config import Config
    payload = {
        "user_id": user.id,
        "email":   user.email,
        "role":    user.role,
        "name":    user.name,
        "exp":     datetime.now(timezone.utc) + timedelta(days=Config.JWT_EXPIRY_DAYS),
        "iat":     datetime.now(timezone.utc),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    """
    Decode and verify a JWT.
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


# ── Decorators ───────────────────────────────────────────────

def require_auth(f):
    """
    Decorator: requires a valid JWT.
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
    so unauthenticated demo use still works.
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
