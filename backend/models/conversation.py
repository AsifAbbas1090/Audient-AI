"""
Conversation (session) and AudioFile models.
A Conversation is the top-level entity — every recording session maps to one.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Conversation(db.Model):
    __tablename__ = "conversations"

    id      = db.Column(db.String(36), primary_key=True, default=_uuid)
    # FK to users — nullable so existing rows and unauthenticated demos still work
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title    = db.Column(db.String(500), nullable=True)
    date     = db.Column(db.DateTime(timezone=True), default=_now)
    language = db.Column(db.String(50),  nullable=True)
    duration = db.Column(db.Integer,     nullable=True)   # seconds
    status   = db.Column(
        db.String(20),
        default="processing",
        nullable=False,
    )  # processing | complete | failed | approved
    is_offline  = db.Column(db.Boolean, default=True, nullable=False)
    created_at  = db.Column(db.DateTime(timezone=True), default=_now)
    approved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    deleted_at  = db.Column(db.DateTime(timezone=True), nullable=True)  # soft delete

    # Optional link to a parent session (continuation sessions)
    parent_id = db.Column(
        db.String(36),
        db.ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Optional link to a Patient record
    patient_id  = db.Column(
        db.String(36),
        db.ForeignKey("patients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    template_version_id = db.Column(
        db.String(36),
        db.ForeignKey("doctor_template_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Locked patient-facing layout + branding snapshot for this session (legal/audit trail)
    patient_template_version_id = db.Column(
        db.String(36),
        db.ForeignKey("doctor_template_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # One-to-one relationships (cascade delete children with parent)
    audio_file = db.relationship(
        "AudioFile", backref="conversation", uselist=False, cascade="all, delete-orphan"
    )
    transcript = db.relationship(
        "Transcript", backref="conversation", uselist=False, cascade="all, delete-orphan"
    )
    summary = db.relationship(
        "Summary", backref="conversation", uselist=False, cascade="all, delete-orphan"
    )
    template_version = db.relationship(
        "DoctorTemplateVersion", foreign_keys=[template_version_id]
    )
    patient_template_version = db.relationship(
        "DoctorTemplateVersion", foreign_keys=[patient_template_version_id]
    )

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "user_id":     self.user_id,
            "title":       self.title,
            "date":        self.date.isoformat() if self.date else None,
            "language":    self.language,
            "duration":    self.duration,
            "status":      self.status,
            "is_offline":  self.is_offline,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "deleted_at":  self.deleted_at.isoformat()  if self.deleted_at  else None,
            "patient_id":    self.patient_id,
            "patient_code":  self.patient.patient_code if self.patient else None,
            "patient_name":  self.patient.name if self.patient else None,
            "parent_id":   self.parent_id,
            "template_version_id": self.template_version_id,
            "patient_template_version_id": self.patient_template_version_id,
        }

    def _template_version_meta(self, tv) -> dict | None:
        if not tv:
            return None
        tmpl = getattr(tv, "template", None)
        return {
            "id": tv.id,
            "template_id": tv.template_id,
            "template_name": tmpl.name if tmpl else None,
            "purpose": tmpl.purpose if tmpl else "clinical",
            "version_number": tv.version_number,
            "created_at": tv.created_at.isoformat() if tv.created_at else None,
            "id_short": tv.id[:8] if tv.id else None,
        }

    def template_version_public_dict(self) -> dict | None:
        """Lightweight clinical template version metadata for API (no full schema dump)."""
        return self._template_version_meta(self.template_version)

    def patient_template_version_public_dict(self) -> dict | None:
        """Lightweight patient-facing template version metadata."""
        return self._template_version_meta(self.patient_template_version)

    def to_dict_full(self) -> dict:
        """Full representation including nested transcript, summary, audio, patient."""
        data = self.to_dict()
        data["template_version"] = self.template_version_public_dict()
        data["patient_template_version"] = self.patient_template_version_public_dict()
        if self.transcript:
            data["transcript"] = self.transcript.to_dict_full()
        if self.summary:
            data["summary"] = self.summary.to_dict()
        if self.audio_file:
            data["audio_file"] = self.audio_file.to_dict()
        if self.patient:
            data["patient"] = self.patient.to_dict_with_stats()
        return data


class AudioFile(db.Model):
    __tablename__ = "audio_files"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    conversation_id = db.Column(
        db.String(36),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    file_url = db.Column(db.Text, nullable=True)         # S3 / Supabase Storage URL or local path
    storage_type = db.Column(db.String(10), default="local")  # local | supabase | s3
    format = db.Column(db.String(10), nullable=True)     # wav | webm | mp3
    size_mb = db.Column(db.Float, nullable=True)
    duration_seconds = db.Column(db.Integer, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "file_url": self.file_url,
            "storage_type": self.storage_type,
            "format": self.format,
            "size_mb": self.size_mb,
            "duration_seconds": self.duration_seconds,
        }
