"""
Session access control models.
SessionAccess: grants a colleague read/comment/write access to a session.
SessionComment: annotations any user with access can leave on a session.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid(): return str(uuid.uuid4())
def _now():  return datetime.now(timezone.utc)

PERMISSION_LEVELS = ("read", "comment", "write")


class SessionAccess(db.Model):
    __tablename__ = "session_access"

    id            = db.Column(db.String(36), primary_key=True, default=_uuid)
    session_id    = db.Column(db.String(36), db.ForeignKey("conversations.id", ondelete="CASCADE"),  nullable=False, index=True)
    granted_by_id = db.Column(db.String(36), db.ForeignKey("users.id",         ondelete="CASCADE"),  nullable=False)
    grantee_id    = db.Column(db.String(36), db.ForeignKey("users.id",         ondelete="CASCADE"),  nullable=False, index=True)
    permission    = db.Column(db.String(10), nullable=False, default="read")   # read | comment | write
    expires_at    = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_at    = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at    = db.Column(db.DateTime(timezone=True), default=_now)

    grantee    = db.relationship("User", foreign_keys=[grantee_id],    lazy="joined")
    granted_by = db.relationship("User", foreign_keys=[granted_by_id], lazy="joined")

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        if self.expires_at and self.expires_at < datetime.now(timezone.utc):
            return False
        return True

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "session_id":  self.session_id,
            "permission":  self.permission,
            "expires_at":  self.expires_at.isoformat()  if self.expires_at  else None,
            "revoked_at":  self.revoked_at.isoformat()  if self.revoked_at  else None,
            "created_at":  self.created_at.isoformat()  if self.created_at  else None,
            "is_active":   self.is_active,
            "grantee": {
                "id":       self.grantee.id,
                "name":     self.grantee.name,
                "email":    self.grantee.email,
                "specialty":self.grantee.specialty,
                "doctor_title": self.grantee.doctor_title,
            } if self.grantee else None,
            "granted_by": {
                "id":   self.granted_by.id,
                "name": self.granted_by.name,
            } if self.granted_by else None,
        }


class SessionComment(db.Model):
    __tablename__ = "session_comments"

    id         = db.Column(db.String(36), primary_key=True, default=_uuid)
    session_id = db.Column(db.String(36), db.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id  = db.Column(db.String(36), db.ForeignKey("users.id",         ondelete="CASCADE"), nullable=False)
    body       = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    author = db.relationship("User", foreign_keys=[author_id], lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "session_id": self.session_id,
            "body":       self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "author": {
                "id":       self.author.id,
                "name":     self.author.name,
                "specialty": self.author.specialty,
            } if self.author else None,
        }
