"""
In-app notification routes (Phase 4).

GET    /api/notifications           — recent (50) + unread count
PATCH  /api/notifications/read-all  — mark all read
PATCH  /api/notifications/:id/read  — mark one read
"""
from __future__ import annotations

from flask import Blueprint, jsonify, g

from extensions import db
from models.notification import Notification
from utils.auth import require_auth

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

_RECENT_LIMIT = 50


@notifications_bp.route("", methods=["GET"])
@require_auth
def list_notifications():
    rows = (
        Notification.query.filter_by(user_id=g.user_id)
        .order_by(Notification.created_at.desc())
        .limit(_RECENT_LIMIT)
        .all()
    )
    unread = (
        Notification.query.filter_by(user_id=g.user_id, read_at=None)
        .count()
    )
    return jsonify({
        "notifications": [n.to_dict() for n in rows],
        "unread_count":  unread,
    }), 200


@notifications_bp.route("/read-all", methods=["PATCH"])
@require_auth
def mark_all_read():
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    (
        Notification.query.filter_by(user_id=g.user_id, read_at=None)
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True}), 200


@notifications_bp.route("/<string:nid>/read", methods=["PATCH"])
@require_auth
def mark_one_read(nid: str):
    from datetime import datetime, timezone

    n = Notification.query.filter_by(id=nid, user_id=g.user_id).first()
    if not n:
        return jsonify({"error": "Notification not found"}), 404
    if not n.read_at:
        n.read_at = datetime.now(timezone.utc)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    return jsonify({"notification": n.to_dict()}), 200
