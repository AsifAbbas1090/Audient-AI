"""
Transcript and TranscriptLine models.
Transcript: top-level text output for a conversation.
TranscriptLine: individual speaker turn (start, end, speaker, text).
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Transcript(db.Model):
    __tablename__ = "transcripts"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    conversation_id = db.Column(
        db.String(36),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    raw_text = db.Column(db.Text, nullable=True)           # full concatenated transcript
    english_script = db.Column(db.Text, nullable=True)     # English-normalized version
    language_detected = db.Column(db.String(50), nullable=True)
    confidence_score = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    # One-to-many: one transcript has many lines
    lines = db.relationship(
        "TranscriptLine",
        backref="transcript",
        cascade="all, delete-orphan",
        order_by="TranscriptLine.line_order",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "raw_text": self.raw_text,
            "english_script": self.english_script,
            "language_detected": self.language_detected,
            "confidence_score": self.confidence_score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict_full(self) -> dict:
        data = self.to_dict()
        data["lines"] = [line.to_dict() for line in self.lines]
        return data


class TranscriptLine(db.Model):
    __tablename__ = "transcript_lines"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    transcript_id = db.Column(
        db.String(36),
        db.ForeignKey("transcripts.id", ondelete="CASCADE"),
        nullable=False,
    )
    speaker = db.Column(db.String(50), nullable=True)    # Speaker 1 | Speaker 2
    text = db.Column(db.Text, nullable=False)
    start_time = db.Column(db.Float, nullable=True)      # seconds from recording start
    end_time = db.Column(db.Float, nullable=True)
    line_order = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "speaker": self.speaker,
            "text": self.text,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "line_order": self.line_order,
        }
