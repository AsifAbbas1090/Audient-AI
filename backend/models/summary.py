"""
Summary and FieldReminder models.
Summary: AI-generated summary with extracted medical entities (stored as JSON).
FieldReminder: tracks which fields were flagged as incomplete by the AI checker.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Summary(db.Model):
    __tablename__ = "summaries"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    conversation_id = db.Column(
        db.String(36),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    summary_text = db.Column(db.Text, nullable=True)
    key_points = db.Column(db.JSON, nullable=True)          # list of strings
    extracted_entities = db.Column(db.JSON, nullable=True)  # medical fields dict

    # Extracted medical fields (from Ollama)
    patient_name = db.Column(db.String(255), nullable=True)
    patient_age = db.Column(db.String(20), nullable=True)
    patient_gender = db.Column(db.String(20), nullable=True)
    disease = db.Column(db.String(500), nullable=True)
    education = db.Column(db.String(255), nullable=True)
    emotional_state = db.Column(db.String(255), nullable=True)
    additional_notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    # One-to-many: a summary can have multiple field reminders
    field_reminders = db.relationship(
        "FieldReminder",
        backref="summary",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "summary_text": self.summary_text,
            "key_points": self.key_points,
            "extracted_entities": self.extracted_entities,
            "patient_name": self.patient_name,
            "patient_age": self.patient_age,
            "patient_gender": self.patient_gender,
            "disease": self.disease,
            "education": self.education,
            "emotional_state": self.emotional_state,
            "additional_notes": self.additional_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "field_reminders": [r.to_dict() for r in self.field_reminders],
        }


class FieldReminder(db.Model):
    """
    AI Field Reminder (UC-06).
    Records which medical fields were flagged as missing/incomplete
    after a session is finalized.
    """
    __tablename__ = "field_reminders"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    summary_id = db.Column(
        db.String(36),
        db.ForeignKey("summaries.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_name = db.Column(db.String(100), nullable=False)
    severity = db.Column(db.String(10), nullable=False)   # critical | important | optional
    is_resolved = db.Column(db.Boolean, default=False, nullable=False)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "field_name": self.field_name,
            "severity": self.severity,
            "is_resolved": self.is_resolved,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
