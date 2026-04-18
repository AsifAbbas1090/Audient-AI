"""
Patient model — a patient thread that groups sessions under a human-readable PAT code.
One patient → many conversations (one-to-many).
PAT codes are scoped per doctor (created_by), so two doctors can have PAT-2847 independently.
"""
import random
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


def generate_pat_code(owner_user_id: str) -> str:
    """Generate a unique PAT-XXXX code scoped to this doctor. Retries on collision."""
    for _ in range(20):
        code = f"PAT-{random.randint(1000, 9999)}"
        exists = Patient.query.filter_by(patient_code=code, created_by=owner_user_id).first()
        if not exists:
            return code
    # Fallback to 5-digit if 4-digit space is exhausted
    return f"PAT-{random.randint(10000, 99999)}"


class Patient(db.Model):
    __tablename__ = "patients"

    id             = db.Column(db.String(36), primary_key=True, default=_uuid)
    patient_code   = db.Column(db.String(12), nullable=True, index=True)   # PAT-XXXX, unique per doctor
    name           = db.Column(db.String(255), nullable=False, index=True)
    age            = db.Column(db.String(20),  nullable=True)
    gender         = db.Column(db.String(20),  nullable=True)
    contact        = db.Column(db.String(255), nullable=True)
    medical_history= db.Column(db.Text,        nullable=True)

    created_by     = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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
            "patient_code":    self.patient_code,
            "name":            self.name,
            "age":             self.age,
            "gender":          self.gender,
            "contact":         self.contact,
            "medical_history": self.medical_history,
            "created_by":      self.created_by,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict_with_stats(self) -> dict:
        """Includes session_count and last_session_at for list views."""
        data = self.to_dict()
        active = self.conversations.filter_by(deleted_at=None)
        data["session_count"] = active.count()
        last = active.order_by(db.text("created_at DESC")).first()
        data["last_session_at"] = last.created_at.isoformat() if last and last.created_at else None
        return data

    def to_dict_full(self) -> dict:
        """Full thread view — includes all sessions ordered by date."""
        data = self.to_dict()
        sessions = (
            self.conversations
            .filter_by(deleted_at=None)
            .order_by(db.text("created_at DESC"))
            .all()
        )
        data["sessions"] = [c.to_dict() for c in sessions]
        data["session_count"] = len(sessions)
        data["last_session_at"] = sessions[0].created_at.isoformat() if sessions and sessions[0].created_at else None
        return data
