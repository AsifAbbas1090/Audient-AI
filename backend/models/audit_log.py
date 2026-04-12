"""
AuditLog model — records key user actions for admin visibility.

Logged events:
  session_created   — new conversation saved
  session_approved  — conversation approved + locked
  session_deleted   — conversation soft-deleted
  session_restored  — conversation un-deleted (admin)
  summary_updated   — medical fields edited
  user_role_changed — admin changed a user's role
  user_deleted      — admin deleted a user account
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id            = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id       = db.Column(db.String(36), nullable=True)   # who performed the action
    user_name     = db.Column(db.String(255), nullable=True)  # snapshot (user may be deleted later)
    action        = db.Column(db.String(50),  nullable=False, index=True)
    resource_type = db.Column(db.String(50),  nullable=True)  # 'conversation' | 'user' | etc.
    resource_id   = db.Column(db.String(36),  nullable=True,  index=True)
    details       = db.Column(db.JSON,        nullable=True)  # arbitrary extra context
    created_at    = db.Column(db.DateTime(timezone=True), default=_now, index=True)

    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "user_id":       self.user_id,
            "user_name":     self.user_name,
            "action":        self.action,
            "resource_type": self.resource_type,
            "resource_id":   self.resource_id,
            "details":       self.details,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }
