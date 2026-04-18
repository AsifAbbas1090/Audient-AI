"""
Doctor template models with immutable version history.

Each user may have one template row per *purpose* (e.g. clinical vs patient-facing PDF),
each with its own version history.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class DoctorTemplate(db.Model):
    __tablename__ = "doctor_templates"
    __table_args__ = (
        db.UniqueConstraint("user_id", "purpose", name="uq_doctor_templates_user_purpose"),
    )

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose = db.Column(db.String(32), nullable=False, default="clinical")
    # purpose: clinical | patient_facing

    name = db.Column(db.String(255), nullable=False, default="My Clinical Template")
    specialty_base = db.Column(db.String(50), nullable=False, default="general_mbbs")
    schema_json = db.Column(db.JSON, nullable=False)
    active_version_id = db.Column(
        db.String(36),
        db.ForeignKey("doctor_template_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

    user = db.relationship("User", backref=db.backref("doctor_templates", lazy="dynamic"))
    versions = db.relationship(
        "DoctorTemplateVersion",
        backref="template",
        cascade="all, delete-orphan",
        foreign_keys="DoctorTemplateVersion.template_id",
        order_by="DoctorTemplateVersion.version_number.desc()",
    )
    active_version = db.relationship(
        "DoctorTemplateVersion",
        foreign_keys=[active_version_id],
        post_update=True,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "purpose": self.purpose,
            "name": self.name,
            "specialty_base": self.specialty_base,
            "schema_json": self.schema_json,
            "active_version_id": self.active_version_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DoctorTemplateVersion(db.Model):
    __tablename__ = "doctor_template_versions"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    template_id = db.Column(
        db.String(36),
        db.ForeignKey("doctor_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = db.Column(db.Integer, nullable=False)
    schema_json = db.Column(db.JSON, nullable=False)
    branding_snapshot_json = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    __table_args__ = (
        db.UniqueConstraint("template_id", "version_number", name="uq_template_version_number"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "template_id": self.template_id,
            "version_number": self.version_number,
            "schema_json": self.schema_json,
            "branding_snapshot_json": self.branding_snapshot_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
