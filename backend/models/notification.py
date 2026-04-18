"""
In-app notifications (Phase 4). Delivered via REST + polling; no email/WebSocket in MVP.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Notification(db.Model):
    __tablename__ = "notifications"

    id           = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id      = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type         = db.Column(db.String(50), nullable=False, index=True)
    payload_json = db.Column(db.JSON, nullable=True)
    read_at      = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at   = db.Column(db.DateTime(timezone=True), default=_now, index=True)

    user = db.relationship("User", foreign_keys=[user_id], lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "type":         self.type,
            "payload_json": self.payload_json or {},
            "read_at":      self.read_at.isoformat() if self.read_at else None,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }


def create_notification(user_id: str, ntype: str, payload: dict | None = None) -> Notification:
    """Insert a notification row (caller should commit)."""
    n = Notification(
        user_id=user_id,
        type=ntype,
        payload_json=payload or {},
    )
    db.session.add(n)
    return n
