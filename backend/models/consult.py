"""
ConsultRequest model — doctor-to-doctor consultation/second-opinion requests.
Each request auto-generates a briefing card snapshot from session data and
creates a SessionAccess grant for the reviewer.
"""
import uuid
from datetime import datetime, timezone
from extensions import db


def _uuid(): return str(uuid.uuid4())
def _now():  return datetime.now(timezone.utc)

CONSULT_MODES    = ("quick_opinion", "formal_consult", "urgent")
CONSULT_STATUSES = ("pending", "accepted", "declined", "expired", "resolved")

# Access permission granted per mode
MODE_PERMISSION = {
    "quick_opinion":  "read",
    "formal_consult": "comment",
    "urgent":         "write",
}

# Hours until request expires per mode
MODE_EXPIRY_HOURS = {
    "quick_opinion":  4,
    "formal_consult": 48,
    "urgent":         24,
}


class ConsultRequest(db.Model):
    __tablename__ = "consult_requests"

    id                = db.Column(db.String(36), primary_key=True, default=_uuid)
    session_id        = db.Column(db.String(36), db.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_thread_id = db.Column(db.String(36), db.ForeignKey("patients.id",      ondelete="SET NULL"), nullable=True)
    requester_id      = db.Column(db.String(36), db.ForeignKey("users.id",          ondelete="CASCADE"), nullable=False)
    reviewer_id       = db.Column(db.String(36), db.ForeignKey("users.id",          ondelete="CASCADE"), nullable=False, index=True)
    mode              = db.Column(db.String(20), nullable=False)     # quick_opinion | formal_consult | urgent
    access_id         = db.Column(db.String(36), db.ForeignKey("session_access.id", ondelete="SET NULL"), nullable=True)
    status            = db.Column(db.String(20), nullable=False, default="pending")
    briefing_json     = db.Column(db.JSON, nullable=True)
    requester_note    = db.Column(db.Text, nullable=True)
    respond_note      = db.Column(db.Text, nullable=True)   # optional note from reviewer on accept/decline
    created_at        = db.Column(db.DateTime(timezone=True), default=_now)
    responded_at      = db.Column(db.DateTime(timezone=True), nullable=True)
    expires_at        = db.Column(db.DateTime(timezone=True), nullable=False)

    requester      = db.relationship("User",          foreign_keys=[requester_id], lazy="joined")
    reviewer       = db.relationship("User",          foreign_keys=[reviewer_id],  lazy="joined")
    session        = db.relationship("Conversation",  foreign_keys=[session_id],   lazy="joined")
    patient_thread = db.relationship("Patient",       foreign_keys=[patient_thread_id], lazy="joined")
    access         = db.relationship("SessionAccess", foreign_keys=[access_id],    lazy="joined")

    @property
    def is_expired(self) -> bool:
        return self.expires_at < datetime.now(timezone.utc) and self.status == "pending"

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "session_id":   self.session_id,
            "mode":         self.mode,
            "status":       self.status,
            "requester_note": self.requester_note,
            "respond_note":   self.respond_note,
            "briefing_json":  self.briefing_json,
            "requester_name": self.requester.name if self.requester else None,
            "reviewer_name":  self.reviewer.name if self.reviewer else None,
            "session_title":  self.session.title if self.session else None,
            "created_at":   self.created_at.isoformat()   if self.created_at   else None,
            "responded_at": self.responded_at.isoformat() if self.responded_at else None,
            "expires_at":   self.expires_at.isoformat()   if self.expires_at   else None,
            "is_expired":   self.is_expired,
            "permission":   MODE_PERMISSION.get(self.mode, "read"),
            "session": {
                "id":    self.session.id,
                "title": self.session.title,
                "status":self.session.status,
            } if self.session else None,
            "patient_thread": {
                "id":           self.patient_thread.id,
                "patient_code": self.patient_thread.patient_code,
                "name":         self.patient_thread.name,
            } if self.patient_thread else None,
            "requester": {
                "id":           self.requester.id,
                "name":         self.requester.name,
                "specialty":    self.requester.specialty,
                "doctor_title": self.requester.doctor_title,
                "clinic_name":  self.requester.clinic_name,
            } if self.requester else None,
            "reviewer": {
                "id":           self.reviewer.id,
                "name":         self.reviewer.name,
                "specialty":    self.reviewer.specialty,
                "doctor_title": self.reviewer.doctor_title,
            } if self.reviewer else None,
        }
