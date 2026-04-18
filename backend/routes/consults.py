"""
Consultation request routes (Phase 3).

POST   /api/consults                  — create request (auto-grants access, snapshots briefing)
GET    /api/consults/inbox            — incoming consult requests for me
GET    /api/consults/sent             — consult requests I sent
PATCH  /api/consults/:id/respond      — reviewer accepts or declines
PATCH  /api/consults/:id/resolve      — requester marks resolved
GET    /api/consults/:id/briefing     — fetch briefing card JSON
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, g

from extensions import db
from models.access import SessionAccess
from models.consult import ConsultRequest, MODE_PERMISSION, MODE_EXPIRY_HOURS
from models.notification import create_notification
from models.conversation import Conversation
from models.user import User
from utils.auth import require_auth

consults_bp = Blueprint("consults", __name__, url_prefix="/api/consults")

MODE_LABELS = {
    "quick_opinion":  "Quick Second Opinion",
    "formal_consult": "Formal Consult",
    "urgent":         "Urgent",
}


# ── Briefing card composer ────────────────────────────────────────────────────

def _compose_briefing(
    conv: Conversation,
    include_thread: bool,
    requester: User,
    mode: str,
    expires_at: datetime,
    permission: str,
) -> dict:
    s = conv.summary

    medications: list[str] = []
    if s and s.extracted_entities:
        raw = s.extracted_entities.get("Medications") or s.extracted_entities.get("medications") or []
        if isinstance(raw, list):
            medications = [str(m) for m in raw if m]
        elif isinstance(raw, str) and raw:
            medications = [raw]

    session_history: list[dict] = []
    patient_code = None
    patient_name = None

    if include_thread and conv.patient:
        pt = conv.patient
        patient_code = pt.patient_code
        patient_name = pt.name
        sessions = (
            pt.conversations
            .filter_by(deleted_at=None)
            .order_by(db.text("created_at ASC"))
            .all()
        )
        session_history = [
            {
                "id":     c.id,
                "title":  c.title,
                "date":   c.created_at.isoformat() if c.created_at else None,
                "status": c.status,
            }
            for c in sessions
        ]
    elif conv.patient:
        patient_code = conv.patient.patient_code
        patient_name = conv.patient.name

    flagged_fields = []
    ai_flagged_concerns: list[dict] = []
    if s and s.field_reminders:
        for r in s.field_reminders:
            if not r.is_resolved:
                flagged_fields.append(r.field_name)
                ai_flagged_concerns.append({
                    "field_name": r.field_name,
                    "severity":   r.severity,
                })

    return {
        "session_id":           conv.id,
        "session_title":        conv.title,
        "session_date":         conv.created_at.isoformat() if conv.created_at else None,
        "patient_name":         (s.patient_name if s else None) or patient_name,
        "patient_code":         patient_code,
        "diagnosis":            s.disease          if s else None,
        "additional_notes":     s.additional_notes if s else None,
        "medications":          medications,
        "follow_up_questions":  (s.follow_up_questions or []) if s else [],
        "flagged_fields":       flagged_fields,
        "ai_flagged_concerns":  ai_flagged_concerns,
        "session_history":      session_history,
        "session_count":        max(1, len(session_history)) if include_thread else 1,
        "requester_name":       requester.name,
        "requester_specialty":  requester.specialty,
        "requester_title":      requester.doctor_title,
        "requester_clinic":     requester.clinic_name,
        "consult_mode":         mode,
        "consult_mode_label":   MODE_LABELS.get(mode, mode),
        "access_permission":    permission,
        "access_expires_at":    expires_at.isoformat(),
        "include_full_thread":  include_thread,
        "generated_at":         datetime.now(timezone.utc).isoformat(),
    }


# ── Create consult ────────────────────────────────────────────────────────────

@consults_bp.route("", methods=["POST"])
@require_auth
def create_consult():
    """
    Body:
      session_id        (required)
      reviewer_id       (required)
      mode              quick_opinion | formal_consult | urgent
      include_thread    bool (share full patient thread or this session only)
      requester_note    optional free text
    """
    data           = request.get_json() or {}
    session_id     = (data.get("session_id") or "").strip()
    reviewer_id    = (data.get("reviewer_id") or "").strip()
    mode           = (data.get("mode") or "quick_opinion").strip()
    include_thread = bool(data.get("include_thread", False))
    note           = (data.get("requester_note") or "").strip() or None

    if not session_id or not reviewer_id:
        return jsonify({"error": "session_id and reviewer_id are required"}), 400
    if mode not in MODE_EXPIRY_HOURS:
        return jsonify({"error": f"mode must be one of {list(MODE_EXPIRY_HOURS)}"}), 400

    conv = Conversation.query.get(session_id)
    if not conv or conv.deleted_at:
        return jsonify({"error": "Session not found"}), 404
    if conv.user_id != g.user_id:
        return jsonify({"error": "Only the session owner can send a consult request"}), 403

    reviewer = User.query.get(reviewer_id)
    if not reviewer:
        return jsonify({"error": "Reviewer user not found"}), 404
    if reviewer_id == g.user_id:
        return jsonify({"error": "Cannot send a consult request to yourself"}), 400

    requester = User.query.get(g.user_id)
    now       = datetime.now(timezone.utc)
    expires   = now + timedelta(hours=MODE_EXPIRY_HOURS[mode])
    permission = MODE_PERMISSION[mode]

    try:
        # Revoke any existing active grant to this reviewer for this session
        old = SessionAccess.query.filter_by(
            session_id=session_id, grantee_id=reviewer_id, revoked_at=None
        ).first()
        if old:
            old.revoked_at = now

        # Create access grant
        grant = SessionAccess(
            session_id    = session_id,
            granted_by_id = g.user_id,
            grantee_id    = reviewer_id,
            permission    = permission,
            expires_at    = expires,
        )
        db.session.add(grant)
        db.session.flush()

        # Compose briefing snapshot (immutable card for reviewer)
        briefing = _compose_briefing(conv, include_thread, requester, mode, expires, permission)

        consult = ConsultRequest(
            session_id        = session_id,
            patient_thread_id = conv.patient_id if include_thread else None,
            requester_id      = g.user_id,
            reviewer_id       = reviewer_id,
            mode              = mode,
            access_id         = grant.id,
            status            = "pending",
            briefing_json     = briefing,
            requester_note    = note,
            expires_at        = expires,
        )
        db.session.add(consult)
        create_notification(
            reviewer_id,
            "consult_received",
            {
                "consult_id":   consult.id,
                "session_id":   session_id,
                "from_name":    requester.name,
                "from_id":      requester.id,
                "mode":         mode,
                "patient_code": briefing.get("patient_code"),
            },
        )
        db.session.commit()

        return jsonify({
            "consult_id":       consult.id,
            "briefing_preview": briefing,
            "access_granted":   grant.to_dict(),
            "consult":          consult.to_dict(),
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ── Inbox ─────────────────────────────────────────────────────────────────────

@consults_bp.route("/inbox", methods=["GET"])
@require_auth
def inbox():
    now = datetime.now(timezone.utc)
    consults = (
        ConsultRequest.query
        .filter_by(reviewer_id=g.user_id)
        .order_by(ConsultRequest.created_at.desc())
        .all()
    )
    # Auto-expire pending ones past their window
    for c in consults:
        if c.status == "pending" and c.expires_at < now:
            c.status = "expired"
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    items = []
    for c in consults:
        d = c.to_dict()
        if c.status == "pending" and c.expires_at >= now:
            secs = (c.expires_at - now).total_seconds()
            d["expiring_soon"] = 0 <= secs < 6 * 3600
        else:
            d["expiring_soon"] = False
        items.append(d)

    return jsonify({
        "consults": items,
        "total":    len(consults),
        "pending":  sum(1 for c in consults if c.status == "pending"),
    }), 200


# ── Sent ──────────────────────────────────────────────────────────────────────

@consults_bp.route("/sent", methods=["GET"])
@require_auth
def sent():
    consults = (
        ConsultRequest.query
        .filter_by(requester_id=g.user_id)
        .order_by(ConsultRequest.created_at.desc())
        .all()
    )
    return jsonify({"consults": [c.to_dict() for c in consults]}), 200


# ── Pending count (for sidebar badge) ────────────────────────────────────────

@consults_bp.route("/inbox/count", methods=["GET"])
@require_auth
def inbox_count():
    now = datetime.now(timezone.utc)
    count = (
        ConsultRequest.query
        .filter_by(reviewer_id=g.user_id, status="pending")
        .filter(ConsultRequest.expires_at > now)
        .count()
    )
    return jsonify({"pending": count}), 200


# ── Respond (reviewer accepts or declines) ────────────────────────────────────

@consults_bp.route("/<string:cid>/respond", methods=["PATCH"])
@require_auth
def respond(cid: str):
    """Body: { action: 'accept' | 'decline', note? }"""
    consult = ConsultRequest.query.get(cid)
    if not consult:
        return jsonify({"error": "Consult request not found"}), 404
    if consult.reviewer_id != g.user_id:
        return jsonify({"error": "Access denied"}), 403
    if consult.status != "pending":
        return jsonify({"error": f"Cannot respond — request is already {consult.status}"}), 409

    data   = request.get_json() or {}
    action = (data.get("action") or "").strip()
    if action not in ("accept", "decline"):
        return jsonify({"error": "action must be 'accept' or 'decline'"}), 400

    consult.status       = "accepted" if action == "accept" else "declined"
    consult.responded_at = datetime.now(timezone.utc)
    consult.respond_note = (data.get("note") or "").strip() or None

    # If declined, revoke the access grant
    if action == "decline" and consult.access:
        consult.access.revoked_at = datetime.now(timezone.utc)

    create_notification(
        consult.requester_id,
        "consult_responded",
        {
            "consult_id": consult.id,
            "session_id": consult.session_id,
            "from_name":  consult.reviewer.name if consult.reviewer else None,
            "action":     action,
            "mode":       consult.mode,
        },
    )

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"consult": consult.to_dict()}), 200


# ── Resolve (requester closes the loop) ──────────────────────────────────────

@consults_bp.route("/<string:cid>/resolve", methods=["PATCH"])
@require_auth
def resolve(cid: str):
    consult = ConsultRequest.query.get(cid)
    if not consult:
        return jsonify({"error": "Consult request not found"}), 404
    if consult.requester_id != g.user_id:
        return jsonify({"error": "Only the requester can resolve a consult"}), 403

    consult.status = "resolved"
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"consult": consult.to_dict()}), 200


# ── Briefing card ─────────────────────────────────────────────────────────────

@consults_bp.route("/<string:cid>/briefing", methods=["GET"])
@require_auth
def get_briefing(cid: str):
    consult = ConsultRequest.query.get(cid)
    if not consult:
        return jsonify({"error": "Consult request not found"}), 404
    if consult.reviewer_id != g.user_id and consult.requester_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    return jsonify({"briefing": consult.briefing_json}), 200
