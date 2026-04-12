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
from utils.auth import require_admin

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ── Platform stats ───────────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@require_admin
def stats():
    total_users         = User.query.count()
    healthcare_users    = User.query.filter_by(role="healthcare").count()
    admin_users         = User.query.filter_by(role="admin").count()
    total_conversations = Conversation.query.count()
    complete            = Conversation.query.filter_by(status="complete").count()
    processing          = Conversation.query.filter_by(status="processing").count()
    failed              = Conversation.query.filter_by(status="failed").count()

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
    if "role" in data and data["role"] in ("healthcare", "admin"):
        user.role = data["role"]
    if "process_mode" in data and data["process_mode"] in ("online", "offline"):
        user.process_mode = data["process_mode"]
    if "name" in data and data["name"].strip():
        user.name = data["name"].strip()

    try:
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
        db.session.delete(user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": f"User {user_id} deleted"}), 200
