"""
Patient model — represents a patient record that can be linked to sessions.
A patient can be linked to many conversations (one-to-many).
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Patient(db.Model):
    __tablename__ = "patients"

    id             = db.Column(db.String(36), primary_key=True, default=_uuid)
    name           = db.Column(db.String(255), nullable=False, index=True)
    age            = db.Column(db.String(20),  nullable=True)
    gender         = db.Column(db.String(20),  nullable=True)
    contact        = db.Column(db.String(255), nullable=True)   # phone or email
    medical_history= db.Column(db.Text,        nullable=True)   # free-text notes

    created_by     = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at     = db.Column(db.DateTime(timezone=True), default=_now)

    # One patient → many conversations
    conversations  = db.relationship(
        "Conversation",
        backref="patient",
        lazy="dynamic",
        foreign_keys="Conversation.patient_id",
    )

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "name":            self.name,
            "age":             self.age,
            "gender":          self.gender,
            "contact":         self.contact,
            "medical_history": self.medical_history,
            "created_by":      self.created_by,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict_full(self) -> dict:
        """Include recent session summary."""
        data = self.to_dict()
        recent = (
            self.conversations
            .filter_by(deleted_at=None)
            .order_by(db.text("created_at DESC"))
            .limit(5)
            .all()
        )
        data["recent_sessions"] = [c.to_dict() for c in recent]
        data["session_count"]   = self.conversations.filter_by(deleted_at=None).count()
        return data
