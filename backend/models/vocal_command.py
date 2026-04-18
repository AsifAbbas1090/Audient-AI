import uuid
from datetime import datetime, timezone
from extensions import db


class VocalCommandLog(db.Model):
    __tablename__ = "vocal_command_logs"

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id      = db.Column(
        db.String(36),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phrase_heard    = db.Column(db.Text,       nullable=True)
    confidence      = db.Column(db.Float,      nullable=True)
    command_matched = db.Column(db.String(32), nullable=True)
    action_taken    = db.Column(db.Boolean,    nullable=False, default=True)
    triggered_at    = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "session_id":      self.session_id,
            "phrase_heard":    self.phrase_heard,
            "confidence":      self.confidence,
            "command_matched": self.command_matched,
            "action_taken":    self.action_taken,
            "triggered_at":    self.triggered_at.isoformat() if self.triggered_at else None,
        }
