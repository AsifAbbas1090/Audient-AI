"""
Admin routes (UC-05) — require admin role on every endpoint.
  GET  /api/admin/stats        — platform-wide statistics
  GET  /api/admin/users        — list all users
  GET  /api/admin/users/:id    — single user detail
  DELETE /api/admin/users/:id  — delete a user account
  PATCH  /api/admin/users/:id  — update user role or process_mode
"""
from flask import Blueprint, jsonify, request, g
from extensions import db
from models.user import User
from models.conversation import Conversation
from models.audit_log import AuditLog
from utils.auth import require_admin
from utils.audit import log_action

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ── Platform stats ───────────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@require_admin
def stats():
    total_users         = User.query.count()
    healthcare_users    = User.query.filter_by(role="healthcare").count()
    admin_users         = User.query.filter_by(role="admin").count()
    from sqlalchemy import or_
    total_conversations = Conversation.query.filter(Conversation.deleted_at.is_(None)).count()
    complete            = Conversation.query.filter(
                            or_(Conversation.status == "complete", Conversation.status == "approved"),
                            Conversation.deleted_at.is_(None),
                          ).count()
    processing          = Conversation.query.filter_by(status="processing").filter(Conversation.deleted_at.is_(None)).count()
    failed              = Conversation.query.filter_by(status="failed").filter(Conversation.deleted_at.is_(None)).count()

    return jsonify({
        "users": {
            "total":      total_users,
            "healthcare": healthcare_users,
            "admin":      admin_users,
        },
        "conversations": {
            "total":      total_conversations,
            "complete":   complete,
            "processing": processing,
            "failed":     failed,
        },
    }), 200


# ── User list ────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@require_admin
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        d = u.to_dict()
        d["conversation_count"] = Conversation.query.filter_by(user_id=u.id).count()
        result.append(d)
    return jsonify({"users": result, "total": len(result)}), 200


# ── Single user ──────────────────────────────────────────────

@admin_bp.route("/users/<string:user_id>", methods=["GET"])
@require_admin
def get_user(user_id: str):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    d = user.to_dict()
    convs = Conversation.query.filter_by(user_id=user_id).order_by(Conversation.created_at.desc()).limit(10).all()
    d["recent_conversations"] = [c.to_dict() for c in convs]
    d["conversation_count"]   = Conversation.query.filter_by(user_id=user_id).count()
    return jsonify({"user": d}), 200


# ── Update user ──────────────────────────────────────────────

@admin_bp.route("/users/<string:user_id>", methods=["PATCH"])
@require_admin
def update_user(user_id: str):
    if user_id == g.user_id:
        return jsonify({"error": "Cannot modify your own account via admin endpoint"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    old_role = user.role
    if "role" in data and data["role"] in ("healthcare", "admin"):
        user.role = data["role"]
    if "process_mode" in data and data["process_mode"] in ("online", "offline"):
        user.process_mode = data["process_mode"]
    if "name" in data and data["name"].strip():
        user.name = data["name"].strip()

    try:
        if "role" in data and user.role != old_role:
            log_action("user_role_changed", "user", user_id, {"old_role": old_role, "new_role": user.role, "target_name": user.name})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"user": user.to_dict()}), 200


# ── Delete user ──────────────────────────────────────────────

@admin_bp.route("/users/<string:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id: str):
    if user_id == g.user_id:
        return jsonify({"error": "Cannot delete your own account"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        log_action("user_deleted", "user", user_id, {"name": user.name, "email": user.email})
        db.session.delete(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": f"User {user_id} deleted"}), 200


# ── Audit log ────────────────────────────────────────────────

@admin_bp.route("/audit-log", methods=["GET"])
@require_admin
def audit_log():
    """
    Return recent audit log entries.
    Query params:
      limit  — max rows (default 50, max 200)
      action — filter by action string
    """
    limit  = min(int(request.args.get("limit",  50)),  200)
    action = request.args.get("action", "").strip()

    query = AuditLog.query
    if action:
        query = query.filter_by(action=action)

    entries = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return jsonify({"audit_log": [e.to_dict() for e in entries], "total": len(entries)}), 200


# ── Restore soft-deleted conversation ────────────────────────

@admin_bp.route("/conversations/<string:conv_id>/restore", methods=["POST"])
@require_admin
def restore_conversation(conv_id: str):
    """Admin-only: un-delete a soft-deleted conversation."""
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if not conv.deleted_at:
        return jsonify({"error": "Conversation is not deleted"}), 400

    try:
        conv.deleted_at = None
        log_action("session_restored", "conversation", conv_id, {"title": conv.title})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"conversation": conv.to_dict()}), 200
