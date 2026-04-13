"""
Conversation management routes:
  GET    /api/conversations              — list current user's conversations
  POST   /api/conversations              — create & save a new conversation (ASR page)
  GET    /api/conversations/:id          — get single conversation with transcript + summary
  GET    /api/conversations/:id/status   — lightweight status poll (for background task progress)
  PATCH  /api/conversations/:id          — update title/status
  DELETE /api/conversations/:id          — delete (owner or admin)
  POST   /api/conversations/:id/complete — finalise a live session (dispatches background task)
  POST   /api/conversations/:id/audio   — upload & store audio file
  PATCH  /api/conversations/:id/reminders/:rid/resolve — resolve a field reminder
  POST   /api/conversations/:id/recommend             — generate AI clinical insights
"""
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, g
from werkzeug.utils import secure_filename
from extensions import db
from models.conversation import Conversation, AudioFile
from models.transcript import Transcript, TranscriptLine
from models.summary import Summary, FieldReminder
from utils.auth import require_auth, optional_auth
from utils.audit import log_action

conversations_bp = Blueprint("conversations", __name__, url_prefix="/api/conversations")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _save_transcript(conv_id: str, segments: list, language: str | None = None) -> None:
    """Persist transcript + individual lines for a conversation."""
    if not segments:
        return

    raw_text = " ".join(s.get("text", "").strip() for s in segments)

    transcript = Transcript(
        conversation_id=conv_id,
        raw_text=raw_text,
        english_script=raw_text,
        language_detected=language or "Unknown",
    )
    db.session.add(transcript)
    db.session.flush()          # get transcript.id before adding lines

    for i, seg in enumerate(segments):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        line = TranscriptLine(
            transcript_id=transcript.id,
            speaker=seg.get("speaker", "Speaker 1"),
            text=text,
            start_time=seg.get("start"),
            end_time=seg.get("end"),
            line_order=i,
        )
        db.session.add(line)


def _save_summary(conv_id: str, extraction: dict) -> None:
    """Persist AI-extracted medical fields for a conversation."""
    if not extraction or extraction.get("skipped") or extraction.get("error"):
        return

    summary = Summary(
        conversation_id=conv_id,
        patient_name=extraction.get("Name"),
        patient_age=extraction.get("Age"),
        patient_gender=extraction.get("Gender"),
        disease=extraction.get("Disease"),
        education=extraction.get("Education"),
        emotional_state=extraction.get("EmotionalState"),
        additional_notes=extraction.get("AdditionalNotes"),
        extracted_entities=extraction,
    )
    db.session.add(summary)


def _auto_title(segments: list) -> str:
    """Generate a session title from the first few words of the transcript."""
    text = " ".join(s.get("text", "") for s in segments[:3]).strip()
    if len(text) > 60:
        text = text[:57] + "…"
    if not text:
        text = datetime.now(timezone.utc).strftime("Session %b %d, %H:%M")
    return text


# Field severity map — determines which missing fields raise alerts and at what level
_FIELD_SEVERITY: list[tuple[str, str]] = [
    ("patient_name",    "critical"),
    ("disease",         "critical"),
    ("patient_age",     "important"),
    ("patient_gender",  "important"),
    ("emotional_state", "important"),
    ("education",       "optional"),
    ("additional_notes","optional"),
]


def _generate_field_reminders(summary: "Summary") -> None:
    """
    Delete existing unresolved FieldReminder rows for this summary, then
    create new ones for every medical field that is still blank.
    Already-resolved reminders are left untouched so the history is preserved.
    """
    # Remove previous *unresolved* reminders so we start fresh
    FieldReminder.query.filter_by(
        summary_id=summary.id, is_resolved=False
    ).delete(synchronize_session=False)

    for field_name, severity in _FIELD_SEVERITY:
        val = getattr(summary, field_name, None)
        if not val or not str(val).strip():
            reminder = FieldReminder(
                summary_id=summary.id,
                field_name=field_name,
                severity=severity,
            )
            db.session.add(reminder)


# ── List ─────────────────────────────────────────────────────────────────────

@conversations_bp.route("", methods=["GET"])
@require_auth
def list_conversations():
    """
    Return conversations for the authenticated user.
    Includes:
      - conversations explicitly owned by this user (user_id = current)
      - orphaned conversations with no owner (user_id IS NULL) — created
        before auth was wired, or from anonymous sessions. These are
        auto-claimed: their user_id is silently updated in this request.
    """
    from sqlalchemy import or_

    query = (
        Conversation.query
        .filter(
            or_(
                Conversation.user_id == g.user_id,
                Conversation.user_id.is_(None),
            )
        )
        .filter(Conversation.deleted_at.is_(None))
    )

    status = request.args.get("status")
    if status in ("processing", "complete", "failed", "approved"):
        query = query.filter_by(status=status)

    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(Conversation.title.ilike(f"%{q}%"))

    convs = query.order_by(Conversation.created_at.desc()).all()

    # Auto-claim orphaned sessions — assign this user as owner
    claimed = [c for c in convs if c.user_id is None]
    if claimed:
        for c in claimed:
            c.user_id = g.user_id
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()   # non-fatal — sessions still returned

    return jsonify({"conversations": [c.to_dict() for c in convs], "total": len(convs)}), 200


# ── Create (ASR page — no pre-existing conversation) ─────────────────────────

@conversations_bp.route("", methods=["POST"])
@optional_auth
def create_conversation():
    """
    Create a conversation and immediately persist transcript + extraction.
    Used by the ASR (Record & Extract) page after a full recording.

    Body:
      segments   — list of { speaker, text, start?, end? }
      extraction — dict of extracted medical fields (or null)
      duration   — seconds (int, optional)
      language   — detected language string (optional)
      title      — override title (optional)
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    data       = request.get_json() or {}
    segments   = data.get("segments") or []
    extraction = data.get("extraction") or {}
    duration   = data.get("duration")
    language   = data.get("language") or "Unknown"
    title      = (data.get("title") or "").strip() or _auto_title(segments)
    user_id    = getattr(g, "user_id", None)

    try:
        conv = Conversation(
            title=title,
            user_id=user_id,
            status="complete",
            duration=int(duration) if duration else None,
            language=language,
            is_offline=False,
        )
        db.session.add(conv)
        db.session.flush()

        _save_transcript(conv.id, segments, language=language)
        _save_summary(conv.id, extraction)
        db.session.flush()  # ensure summary.id is set before generating reminders
        if conv.summary:
            _generate_field_reminders(conv.summary)

        log_action("session_created", "conversation", conv.id, {"title": conv.title})
        db.session.commit()
        return jsonify({"success": True, "conversation_id": conv.id, "conversation": conv.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        print(f"[conversations/create] error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Get single ───────────────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>", methods=["GET"])
@require_auth
def get_conversation(conv_id: str):
    conv = Conversation.query.get(conv_id)
    if not conv or (conv.deleted_at and g.user_role != "admin"):
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    # Auto-claim orphaned session
    if conv.user_id is None:
        conv.user_id = g.user_id
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    return jsonify({"conversation": conv.to_dict_full()}), 200


# ── Finalise live session ─────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/complete", methods=["POST"])
@optional_auth
def complete_conversation(conv_id: str):
    """
    Finalise a live session that was started with /api/session/start.

    NEW behaviour (background processing):
      1. Saves the raw segments to the DB immediately (fast, <100ms).
      2. Dispatches a Celery task (or daemon thread) to run:
            diarize → extract medical fields → save summary → generate reminders
      3. Returns 202 Accepted with { conversation_id, status: "processing" }.
      4. The frontend polls GET /api/conversations/:id/status every 2s until
         status changes to "complete" or "failed", then navigates to the detail page.

    This prevents Groq API timeouts from blocking the HTTP response on long sessions.

    Body:
      segments  — full list of { speaker, text, start?, end? }
      duration  — elapsed seconds
      language  — detected language string
      title     — session title (optional)
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    user_id = getattr(g, "user_id", None)

    conv = Conversation.query.get(conv_id)
    if not conv:
        conv = Conversation(id=conv_id, user_id=user_id, status="processing", is_offline=False)
        db.session.add(conv)
        db.session.flush()

    if conv.user_id and user_id and conv.user_id != user_id and getattr(g, "user_role", "") != "admin":
        return jsonify({"error": "Access denied"}), 403

    data     = request.get_json() or {}
    segments = data.get("segments") or []
    duration = data.get("duration")
    language = (data.get("language") or conv.language or "Unknown")
    title    = (data.get("title") or "").strip() or _auto_title(segments)

    try:
        # ── Immediate DB update (synchronous — fast) ──────────────────────
        conv.status   = "processing"   # signals frontend to poll
        conv.title    = title
        conv.language = language
        conv.duration = int(duration) if duration else conv.duration
        if user_id and not conv.user_id:
            conv.user_id = user_id

        db.session.commit()

        # ── Dispatch background task ──────────────────────────────────────
        # Runs: diarize → extract → save summary → generate reminders → status=complete
        from tasks.process_session import dispatch as dispatch_task
        from flask import current_app
        task_id = dispatch_task(
            current_app._get_current_object(),
            conv_id  = conv_id,
            segments = segments,
            language = language,
            duration = int(duration) if duration else None,
        )

        return jsonify({
            "success":         True,
            "conversation_id": conv_id,
            "status":          "processing",
            "task_id":         task_id,
        }), 202

    except Exception as e:
        db.session.rollback()
        print(f"[conversations/complete] error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Lightweight status poll ───────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/status", methods=["GET"])
@optional_auth
def conversation_status(conv_id: str):
    """
    Lightweight endpoint the frontend polls every 2s after /complete returns 202.
    Returns only { id, status } to keep the payload tiny.
    """
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    user_id = getattr(g, "user_id", None)
    if conv.user_id and user_id and conv.user_id != user_id and getattr(g, "user_role", "") != "admin":
        return jsonify({"error": "Access denied"}), 403

    return jsonify({"id": conv.id, "status": conv.status}), 200


# ── Update ───────────────────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>", methods=["PATCH"])
@require_auth
def update_conversation(conv_id: str):
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    # Allow access if: owner matches, session is orphaned (null owner), or user is admin
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    # Claim orphaned session
    if conv.user_id is None:
        conv.user_id = g.user_id

    # Approved records are locked — only admins can make changes
    if conv.status == "approved" and g.user_role != "admin":
        return jsonify({"error": "Record is approved and locked. Contact an admin to make changes."}), 403

    data = request.get_json() or {}
    if "title" in data:
        conv.title = (data["title"] or "").strip() or conv.title
    new_status = None
    if "status" in data and data["status"] in ("processing", "complete", "failed", "approved"):
        new_status = data["status"]
        if new_status == "approved":
            conv.approved_at = datetime.now(timezone.utc)
        elif conv.status == "approved":
            conv.approved_at = None
        conv.status = new_status

    try:
        if new_status == "approved":
            log_action("session_approved", "conversation", conv.id, {"title": conv.title})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"conversation": conv.to_dict()}), 200


# ── Delete ───────────────────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>", methods=["DELETE"])
@require_auth
def delete_conversation(conv_id: str):
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    try:
        conv.deleted_at = datetime.now(timezone.utc)
        log_action("session_deleted", "conversation", conv.id, {"title": conv.title})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Conversation deleted"}), 200


# ── Update summary (medical fields) ──────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/summary", methods=["PATCH"])
@require_auth
def update_summary(conv_id: str):
    """
    Update (or create) the AI-extracted medical fields for a conversation.
    Accepts any subset of the summary fields — only provided fields are updated.

    Body (all optional):
      patient_name, patient_age, patient_gender, disease,
      education, emotional_state, additional_notes
    """
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    if conv.status == "approved" and g.user_role != "admin":
        return jsonify({"error": "Record is approved and locked."}), 403

    data = request.get_json() or {}
    allowed = {
        "patient_name", "patient_age", "patient_gender",
        "disease", "education", "emotional_state", "additional_notes",
    }

    try:
        summary = conv.summary
        if not summary:
            # No summary yet — create one so the user can add manual data
            summary = Summary(conversation_id=conv_id)
            db.session.add(summary)

        for field in allowed:
            if field in data:
                setattr(summary, field, (data[field] or "").strip() or None)

        _generate_field_reminders(summary)
        log_action("summary_updated", "conversation", conv_id)
        db.session.commit()
        return jsonify({"summary": summary.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ── Audio upload ─────────────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/audio", methods=["POST"])
@optional_auth
def upload_audio(conv_id: str):
    """
    Save an audio file for a completed conversation.
    Stores the file on local disk and records metadata in AudioFile table.

    Form fields:
      file — audio blob (required), typically audio/webm
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    user_id = getattr(g, "user_id", None)
    if conv.user_id and user_id and conv.user_id != user_id and getattr(g, "user_role", "") != "admin":
        return jsonify({"error": "Access denied"}), 403

    if "file" not in request.files:
        return jsonify({"error": "file field is required"}), 400

    audio_file = request.files["file"]
    raw_name   = secure_filename(audio_file.filename or "audio.webm")
    ext        = os.path.splitext(raw_name)[1] or ".webm"

    from config import Config
    audio_dir = os.path.join(Config.SESSIONS_DIR, "audio")
    os.makedirs(audio_dir, exist_ok=True)
    file_path = os.path.join(audio_dir, f"{conv_id}{ext}")
    audio_file.save(file_path)
    size_mb = round(os.path.getsize(file_path) / (1024 * 1024), 3)

    try:
        # Replace existing audio record (idempotent re-upload)
        if conv.audio_file:
            db.session.delete(conv.audio_file)
            db.session.flush()

        af = AudioFile(
            conversation_id=conv_id,
            file_url=file_path,
            storage_type="local",
            format=ext.lstrip("."),
            size_mb=size_mb,
            duration_seconds=conv.duration,
        )
        db.session.add(af)
        db.session.commit()
        return jsonify({"success": True, "audio_file": af.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        print(f"[conversations/audio] error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Resolve a field reminder ─────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/reminders/<string:rid>/resolve", methods=["PATCH"])
@require_auth
def resolve_reminder(conv_id: str, rid: str):
    """Mark a FieldReminder as resolved (dismiss the alert)."""
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    if not conv.summary:
        return jsonify({"error": "No summary for this conversation"}), 404

    reminder = FieldReminder.query.filter_by(id=rid, summary_id=conv.summary.id).first()
    if not reminder:
        return jsonify({"error": "Reminder not found"}), 404

    reminder.is_resolved = True
    reminder.resolved_at = datetime.now(timezone.utc)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"reminder": reminder.to_dict()}), 200


# ── AI Clinical Recommendations ──────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/recommend", methods=["POST"])
@require_auth
def recommend(conv_id: str):
    """
    Generate AI clinical insights for a completed/approved session.
    Calls Groq LLaMA with the transcript + extracted summary.

    Returns:
      {
        "recommendations": {
          "differential_diagnosis": [...],
          "suggested_tests":        [...],
          "treatment_suggestions":  [...],
          "followup_notes":         "...",
          "risk_flags":             [...]
        }
      }
    """
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    if conv.status not in ("complete", "approved"):
        return jsonify({"error": "Recommendations are only available for completed sessions."}), 400

    # Build inputs
    transcript_text = ""
    if conv.transcript:
        if conv.transcript.lines:
            transcript_text = "\n".join(
                f"{l.speaker or 'Speaker'}: {l.text}"
                for l in sorted(conv.transcript.lines, key=lambda x: x.line_order)
            )
        elif conv.transcript.raw_text:
            transcript_text = conv.transcript.raw_text

    summary_data = conv.summary.to_dict() if conv.summary else {}

    try:
        from services.recommend_service import generate_recommendations
        recs = generate_recommendations(transcript_text, summary_data)
        return jsonify({"recommendations": recs}), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[recommend] error: {e}")
        return jsonify({"error": "Failed to generate recommendations."}), 500


# ── Utility ──────────────────────────────────────────────────────────────────

def _db_available() -> bool:
    from config import Config
    return bool(Config.DATABASE_URL)
