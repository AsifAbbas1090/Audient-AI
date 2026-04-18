"""
Session access control routes (Phase 2).

GET    /api/sessions/:id/access          — list active grants (owner only)
POST   /api/sessions/:id/access          — grant access to a colleague
DELETE /api/sessions/:id/access/:aid     — revoke a grant instantly
GET    /api/sessions/shared-with-me      — sessions I have been granted access to
POST   /api/sessions/:id/comments        — add a comment (any access level)
GET    /api/sessions/:id/comments        — list comments
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, g
from sqlalchemy import or_

from extensions import db
from models.access import SessionAccess, SessionComment, PERMISSION_LEVELS
from models.vocal_command import VocalCommandLog
from models.conversation import Conversation
from models.notification import create_notification
from models.user import User
from utils.auth import require_auth

access_bp = Blueprint("access", __name__, url_prefix="/api/sessions")


def _active_grant(session_id: str, user_id: str) -> SessionAccess | None:
    """Return the caller's active grant for a session, or None."""
    now = datetime.now(timezone.utc)
    return (
        SessionAccess.query
        .filter_by(session_id=session_id, grantee_id=user_id, revoked_at=None)
        .filter(or_(SessionAccess.expires_at.is_(None), SessionAccess.expires_at > now))
        .first()
    )


def _require_session_access(conv_id: str, min_level: str = "read"):
    """Return (conv, grant_or_None, is_owner) or raise a 403/404 response."""
    conv = Conversation.query.get(conv_id)
    if not conv or conv.deleted_at:
        return None, None, False, jsonify({"error": "Session not found"}), 404

    is_owner = (conv.user_id == g.user_id) or (g.user_role == "admin")
    if is_owner:
        return conv, None, True, None, None

    grant = _active_grant(conv_id, g.user_id)
    if not grant:
        return None, None, False, jsonify({"error": "Access denied"}), 403

    levels = list(PERMISSION_LEVELS)
    if levels.index(grant.permission) < levels.index(min_level):
        return None, None, False, jsonify({"error": f"Requires {min_level} access"}), 403

    return conv, grant, False, None, None


# ── List grants ───────────────────────────────────────────────────────────────

@access_bp.route("/<string:conv_id>/access", methods=["GET"])
@require_auth
def list_access(conv_id: str):
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Session not found"}), 404
    if conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Only the session owner can view access grants"}), 403

    grants = (
        SessionAccess.query
        .filter_by(session_id=conv_id, revoked_at=None)
        .order_by(SessionAccess.created_at.desc())
        .all()
    )
    return jsonify({"access": [a.to_dict() for a in grants]}), 200


# ── Grant access ──────────────────────────────────────────────────────────────

@access_bp.route("/<string:conv_id>/access", methods=["POST"])
@require_auth
def grant_access(conv_id: str):
    """
    Body: { grantee_id, permission, expires_in_hours? }
    """
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Session not found"}), 404
    if conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Only the session owner can grant access"}), 403

    data       = request.get_json() or {}
    grantee_id = (data.get("grantee_id") or "").strip()
    permission = (data.get("permission") or "read").strip()
    expires_in = data.get("expires_in_hours")

    if not grantee_id:
        return jsonify({"error": "grantee_id is required"}), 400
    if permission not in PERMISSION_LEVELS:
        return jsonify({"error": f"permission must be one of {PERMISSION_LEVELS}"}), 400
    if grantee_id == g.user_id:
        return jsonify({"error": "Cannot grant access to yourself"}), 400

    grantee = User.query.get(grantee_id)
    if not grantee:
        return jsonify({"error": "User not found"}), 404

    expires_at = None
    if expires_in:
        try:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=float(expires_in))
        except (ValueError, TypeError):
            return jsonify({"error": "expires_in_hours must be a number"}), 400

    # Revoke any existing active grant first (idempotent re-grant)
    existing = SessionAccess.query.filter_by(
        session_id=conv_id, grantee_id=grantee_id, revoked_at=None
    ).first()
    if existing:
        existing.revoked_at = datetime.now(timezone.utc)

    grant = SessionAccess(
        session_id    = conv_id,
        granted_by_id = g.user_id,
        grantee_id    = grantee_id,
        permission    = permission,
        expires_at    = expires_at,
    )
    db.session.add(grant)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"access": grant.to_dict()}), 201


# ── Revoke ────────────────────────────────────────────────────────────────────

@access_bp.route("/<string:conv_id>/access/<string:aid>", methods=["DELETE"])
@require_auth
def revoke_access(conv_id: str, aid: str):
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Session not found"}), 404
    if conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Only the session owner can revoke access"}), 403

    grant = SessionAccess.query.filter_by(id=aid, session_id=conv_id).first()
    if not grant:
        return jsonify({"error": "Grant not found"}), 404

    grant.revoked_at = datetime.now(timezone.utc)
    owner = User.query.get(conv.user_id) if conv.user_id else None
    create_notification(
        grant.grantee_id,
        "access_revoked",
        {
            "session_id":   conv_id,
            "session_title": conv.title,
            "revoked_by":   owner.name if owner else None,
        },
    )
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Access revoked"}), 200


# ── Shared with me ────────────────────────────────────────────────────────────

@access_bp.route("/shared-with-me", methods=["GET"])
@require_auth
def shared_with_me():
    now = datetime.now(timezone.utc)
    grants = (
        SessionAccess.query
        .filter_by(grantee_id=g.user_id, revoked_at=None)
        .filter(or_(SessionAccess.expires_at.is_(None), SessionAccess.expires_at > now))
        .order_by(SessionAccess.created_at.desc())
        .all()
    )
    items = []
    for g_obj in grants:
        conv = Conversation.query.get(g_obj.session_id)
        if not conv or conv.deleted_at:
            continue
        d = conv.to_dict()
        d["my_permission"]  = g_obj.permission
        d["access_id"]      = g_obj.id
        d["access_expires"] = g_obj.expires_at.isoformat() if g_obj.expires_at else None
        d["granted_by"]     = {
            "id":   g_obj.granted_by.id,
            "name": g_obj.granted_by.name,
        } if g_obj.granted_by else None
        items.append(d)
    return jsonify({"sessions": items, "total": len(items)}), 200


# ── Comments ──────────────────────────────────────────────────────────────────

@access_bp.route("/<string:conv_id>/comments", methods=["GET"])
@require_auth
def list_comments(conv_id: str):
    conv, grant, is_owner, err, code = _require_session_access(conv_id, "read")
    if err:
        return err, code

    comments = (
        SessionComment.query
        .filter_by(session_id=conv_id)
        .order_by(SessionComment.created_at.asc())
        .all()
    )
    return jsonify({"comments": [c.to_dict() for c in comments]}), 200


@access_bp.route("/<string:conv_id>/comments", methods=["POST"])
@require_auth
def add_comment(conv_id: str):
    conv, grant, is_owner, err, code = _require_session_access(conv_id, "read")
    if err:
        return err, code

    data = request.get_json() or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "body is required"}), 400

    comment = SessionComment(
        session_id=conv_id,
        author_id=g.user_id,
        body=body,
    )
    db.session.add(comment)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"comment": comment.to_dict()}), 201


# ── Vocal command logging ─────────────────────────────────────────────────────

@access_bp.route("/<string:conv_id>/vocal-commands", methods=["POST"])
@require_auth
def log_vocal_command(conv_id: str):
    """
    Log a vocal prompt event (hit or miss) against a session.
    Called client-side every time the wake word fires, whether or not a
    command was matched.  Used for audit trails and UX improvement.

    Body: { phrase_heard, confidence, command_matched, action_taken }
    """
    conv = Conversation.query.get(conv_id)
    if not conv or conv.deleted_at:
        return jsonify({"error": "Session not found"}), 404

    # Allow the session owner or anyone with an active grant to log
    is_owner = conv.user_id == g.user_id or g.user_role == "admin"
    if not is_owner:
        grant = _active_grant(conv_id, g.user_id)
        if not grant:
            return jsonify({"error": "Access denied"}), 403

    data = request.get_json() or {}
    log = VocalCommandLog(
        session_id      = conv_id,
        phrase_heard    = (data.get("phrase_heard") or "")[:500] or None,
        confidence      = data.get("confidence"),
        command_matched = data.get("command_matched"),
        action_taken    = bool(data.get("action_taken", True)),
    )
    db.session.add(log)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"log": log.to_dict()}), 201


@access_bp.route("/<string:conv_id>/vocal-commands", methods=["GET"])
@require_auth
def get_vocal_commands(conv_id: str):
    """Return all vocal command logs for a session (owner only)."""
    conv = Conversation.query.get(conv_id)
    if not conv or conv.deleted_at:
        return jsonify({"error": "Session not found"}), 404
    if conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Owner only"}), 403

    logs = (
        VocalCommandLog.query
        .filter_by(session_id=conv_id)
        .order_by(VocalCommandLog.triggered_at.asc())
        .all()
    )
    return jsonify({"logs": [l.to_dict() for l in logs], "total": len(logs)}), 200
