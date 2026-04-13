"""
User model.
Roles: 'healthcare' (doctor/clinician) | 'admin' (system administrator).
Password is bcrypt-hashed — never stored in plain text.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.String(36),  primary_key=True, default=_uuid)
    email         = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.Text,        nullable=False)
    name          = db.Column(db.String(255), nullable=False)
    role          = db.Column(db.String(20),  nullable=False, default="healthcare")
    # role: 'healthcare' | 'admin'

    process_mode  = db.Column(db.String(10),  nullable=False, default="offline")
    # process_mode: 'online' | 'offline'

    # Incremented on logout to invalidate all outstanding refresh tokens.
    token_version = db.Column(db.Integer, nullable=False, default=0)

    created_at    = db.Column(db.DateTime(timezone=True), default=_now)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # One user → many conversations
    conversations = db.relationship(
        "Conversation",
        backref="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
        foreign_keys="Conversation.user_id",
    )

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "email":        self.email,
            "name":         self.name,
            "role":         self.role,
            "process_mode": self.process_mode,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
