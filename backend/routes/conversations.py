"""
Conversation management routes:
  GET    /api/conversations              — list current user's conversations
  POST   /api/conversations              — create & save a new conversation (ASR page)
  GET    /api/conversations/:id          — get single conversation with transcript + summary
  GET    /api/conversations/:id/status   — lightweight status poll (for background task progress)
  PATCH  /api/conversations/:id          — update title/status
  DELETE /api/conversations/:id          — permanent delete (owner; admin for locked)
  POST   /api/conversations/:id/complete — finalise a live session (dispatches background task)
  POST   /api/conversations/:id/audio   — upload & store audio file
  PATCH  /api/conversations/:id/reminders/:rid/resolve — resolve a field reminder
  POST   /api/conversations/:id/recommend             — generate AI clinical insights
  POST   /api/conversations/:id/retry-processing       — admin: re-queue failed/stuck pipeline
"""
import os
from datetime import datetime, timezone, timedelta

from flask import Blueprint, jsonify, request, g
from werkzeug.utils import secure_filename
from extensions import db
from models.conversation import Conversation, AudioFile
from models.transcript import Transcript, TranscriptLine
from models.summary import Summary, FieldReminder
from utils.auth import require_auth, optional_auth, require_admin
from utils.audit import log_action
from config import Config
from services.template_service import get_active_template_version_id
from services import whisper_service


conversations_bp = Blueprint("conversations", __name__, url_prefix="/api/conversations")


def reconcile_stale_processing_sessions() -> int:
    """
    Clear conversations stuck in status=processing:

    1. Pipeline stuck — POST /complete ran (`processing_started_at` set) but the worker never
       finished (down Celery, crashes). Failed after PROCESSING_STALE_MINUTES (default 20).

    2. Abandoned recording — `/session/start` created the row but `/complete` never ran
       (`processing_started_at` still NULL). Failed after RECORDING_PROCESSING_MAX_AGE_HOURS
       (default 7 days, minimum 24h) based on `created_at`.

    Returns the total number of rows updated.
    """
    if not Config.DATABASE_URL:
        return 0

    now = datetime.now(timezone.utc)
    changed = 0

    minutes = max(5, Config.PROCESSING_STALE_MINUTES)
    pipeline_cutoff = now - timedelta(minutes=minutes)
    pipeline_stuck = (
        Conversation.query.filter(
            Conversation.status == "processing",
            Conversation.deleted_at.is_(None),
            Conversation.processing_started_at.isnot(None),
            Conversation.processing_started_at < pipeline_cutoff,
        )
        .all()
    )
    for c in pipeline_stuck:
        c.status = "failed"
        c.processing_started_at = None
    if pipeline_stuck:
        changed += len(pipeline_stuck)
        print(
            f"[stale-processing] marked {len(pipeline_stuck)} pipeline conversation(s) failed "
            f"(>{minutes}m since /complete — check Celery worker if REDIS_URL is set)"
        )

    hours = Config.RECORDING_PROCESSING_MAX_AGE_HOURS
    abandoned_cutoff = now - timedelta(hours=hours)
    abandoned = (
        Conversation.query.filter(
            Conversation.status == "processing",
            Conversation.deleted_at.is_(None),
            Conversation.processing_started_at.is_(None),
            Conversation.created_at < abandoned_cutoff,
        )
        .all()
    )
    for c in abandoned:
        c.status = "failed"
        c.processing_started_at = None
    if abandoned:
        changed += len(abandoned)
        print(
            f"[stale-processing] marked {len(abandoned)} abandoned recording(s) failed "
            f"(processing, no /complete for >{hours}h since created_at)"
        )

    if changed:
        db.session.commit()
    return changed


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


def _field_blank(val) -> bool:
    """True when extraction / DB field has no usable text."""
    if val is None:
        return True
    s = str(val).strip().lower()
    return s == "" or s in ("null", "none")


def _merge_parent_summary_into_extraction(conv: Conversation, extraction: dict) -> dict:
    """
    For continuation sessions (parent_id set), copy stable demographics from the
    parent's Summary when this visit's transcript did not repeat them.

    Child extraction wins whenever it already has a value.
    """
    if not extraction or extraction.get("skipped") or extraction.get("error"):
        return extraction
    pid = getattr(conv, "parent_id", None)
    if not pid:
        return extraction
    parent = Conversation.query.get(pid)
    if not parent or not parent.summary:
        return extraction

    ps = parent.summary
    parent_entities = ps.extracted_entities if isinstance(ps.extracted_entities, dict) else {}

    def fill(child_json_key: str, summary_column: str, entity_keys: tuple[str, ...]) -> None:
        if not _field_blank(extraction.get(child_json_key)):
            return
        val = getattr(ps, summary_column, None)
        if _field_blank(val):
            for ek in entity_keys:
                ev = parent_entities.get(ek)
                if not _field_blank(ev):
                    val = ev
                    break
        if not _field_blank(val):
            extraction[child_json_key] = val

    fill("Name", "patient_name", ("Name",))
    fill("Age", "patient_age", ("Age",))
    fill("Gender", "patient_gender", ("Gender",))
    fill("Education", "education", ("Education",))
    # Same patient thread — carry diagnosis forward only if this extract left it blank.
    fill("Disease", "disease", ("Disease",))

    return extraction


def segments_from_conversation(conv: Conversation) -> list:
    """Rebuild live-session segment dicts from stored transcript lines."""
    if not conv.transcript:
        return []
    lines = sorted(conv.transcript.lines, key=lambda ln: ln.line_order)
    return [
        {
            "speaker": ln.speaker or "Speaker 1",
            "text":    ln.text,
            "start":   ln.start_time,
            "end":     ln.end_time,
        }
        for ln in lines
    ]


def _save_summary(conv_id: str, extraction: dict, followups: list | None = None) -> None:
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
        follow_up_questions=followups or [],
    )
    db.session.add(summary)


def _smart_title(extraction: dict | None, segments: list, created_at=None) -> str:
    """
    Build a professional session title.
    Priority: Name + Disease  >  Name + date  >  Consultation + date
    Falls back to raw transcript only when extraction is absent entirely.
    """
    name    = ((extraction or {}).get("Name")    or "").strip()
    disease = ((extraction or {}).get("Disease") or "").strip()
    ref     = created_at or datetime.now(timezone.utc)
    date_str = ref.strftime("%b %d, %Y")

    if name and disease:
        return f"{name} — {disease}"[:120]
    if name:
        return f"{name} · {date_str}"[:120]
    if disease:
        return f"Consultation — {disease} · {date_str}"[:120]
    return f"Consultation · {date_str}"


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
    reconcile_stale_processing_sessions()

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
        if Config._is_postgres:
            # Use PostgreSQL full-text search (tsvector GIN index) when available.
            # Falls back to ilike if the column hasn't been added yet.
            try:
                from sqlalchemy import func, cast
                from sqlalchemy.dialects.postgresql import TSVECTOR
                ts_query = func.plainto_tsquery("english", q)
                ts_vec   = func.to_tsvector("english", Conversation.title)
                query = query.filter(ts_vec.op("@@")(ts_query))
            except Exception:
                query = query.filter(Conversation.title.ilike(f"%{q}%"))
        else:
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
    title      = (data.get("title") or "").strip() or _smart_title(extraction, segments)
    user_id    = getattr(g, "user_id", None)

    try:
        conv = Conversation(
            title=title,
            user_id=user_id,
            status="complete",
            duration=int(duration) if duration else None,
            language=language,
            is_offline=False,
            template_version_id=get_active_template_version_id(user_id),
            patient_template_version_id=get_active_template_version_id(user_id, "patient_facing"),
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
    from datetime import datetime, timezone
    from sqlalchemy import or_ as sa_or_
    conv = Conversation.query.get(conv_id)
    if not conv or (conv.deleted_at and g.user_role != "admin"):
        return jsonify({"error": "Conversation not found"}), 404

    is_owner = (conv.user_id == g.user_id) or (g.user_role == "admin") or (conv.user_id is None)

    # Check shared access for non-owners
    my_permission = None
    if not is_owner:
        from models.access import SessionAccess
        now   = datetime.now(timezone.utc)
        grant = (
            SessionAccess.query
            .filter_by(session_id=conv_id, grantee_id=g.user_id, revoked_at=None)
            .filter(sa_or_(SessionAccess.expires_at.is_(None), SessionAccess.expires_at > now))
            .first()
        )
        if not grant:
            return jsonify({"error": "Access denied"}), 403
        my_permission = grant.permission

    # Auto-claim orphaned session
    if conv.user_id is None:
        conv.user_id = g.user_id
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    data = conv.to_dict_full()
    data["my_permission"] = my_permission   # None = owner, else 'read'|'comment'|'write'
    return jsonify({"conversation": data}), 200


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
    title    = (data.get("title") or "").strip() or _smart_title(None, segments)

    try:
        # ── Immediate DB update (synchronous — fast) ──────────────────────
        conv.status   = "processing"   # signals frontend to poll
        conv.processing_started_at = datetime.now(timezone.utc)
        conv.title    = title
        conv.language = language
        conv.duration = int(duration) if duration else conv.duration
        if user_id and not conv.user_id:
            conv.user_id = user_id
        uid = conv.user_id or user_id
        if not conv.template_version_id:
            conv.template_version_id = get_active_template_version_id(uid)
        if not conv.patient_template_version_id:
            conv.patient_template_version_id = get_active_template_version_id(uid, "patient_facing")

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
    reconcile_stale_processing_sessions()

    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    user_id = getattr(g, "user_id", None)
    if conv.user_id and user_id and conv.user_id != user_id and getattr(g, "user_role", "") != "admin":
        return jsonify({"error": "Access denied"}), 403

    return jsonify({"id": conv.id, "status": conv.status}), 200


@conversations_bp.route("/<string:conv_id>/retry-processing", methods=["POST"])
@require_admin
def admin_retry_processing(conv_id: str):
    """
    Re-queue background processing for a failed or stuck session (admin only).
    Uses transcript lines already in the database when available.
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    if conv.status not in ("failed", "processing"):
        return jsonify({"error": "Only failed or processing sessions can be retried"}), 400

    segments = segments_from_conversation(conv)

    try:
        conv.status = "processing"
        conv.processing_started_at = datetime.now(timezone.utc)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    from tasks.process_session import dispatch as dispatch_task
    from flask import current_app

    task_id = dispatch_task(
        current_app._get_current_object(),
        conv_id=conv_id,
        segments=segments,
        language=conv.language or "Unknown",
        duration=conv.duration,
    )

    return jsonify({
        "success": True,
        "conversation_id": conv_id,
        "status": "processing",
        "task_id": task_id,
    }), 202


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

def _purge_conversation_files(conv_id: str, conv: Conversation) -> None:
    """Remove on-disk audio/temp artifacts for this session (best-effort)."""
    from config import Config

    candidates: list[str] = [
        os.path.join(Config.SESSIONS_DIR, f"{conv_id}.wav"),
    ]
    if conv.audio_file and conv.audio_file.file_url:
        candidates.append(conv.audio_file.file_url)
    audio_dir = os.path.join(Config.SESSIONS_DIR, "audio")
    for ext in (".webm", ".wav", ".mp3", ".ogg"):
        candidates.append(os.path.join(audio_dir, f"{conv_id}{ext}"))

    seen: set[str] = set()
    for path in candidates:
        if not path or path in seen:
            continue
        seen.add(path)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError as e:
            print(f"[delete] could not remove file {path}: {e}")

    # Drop in-memory live-session state if the recorder is still open elsewhere.
    try:
        from routes import socket_handlers

        socket_handlers._session_context.pop(conv_id, None)
        socket_handlers._session_diarize_labels.pop(conv_id, None)
        socket_handlers._session_chunk_buffer.pop(conv_id, None)
        socket_handlers._session_anchor_pool.pop(conv_id, None)
        from services import audio_service

        audio_service._sessions.pop(conv_id, None)
    except Exception as e:
        print(f"[delete] socket/audio cleanup skipped: {e}")


@conversations_bp.route("/<string:conv_id>", methods=["DELETE"])
@require_auth
def delete_conversation(conv_id: str):
    """
    Permanently delete a session and all related rows (transcript, summary, access grants, etc.).

    Approved (locked) sessions cannot be deleted by clinicians — admins only.
    """
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    if conv.status == "approved" and g.user_role != "admin":
        return jsonify({
            "error": "This record is approved and locked. It cannot be deleted.",
        }), 403

    title = conv.title
    try:
        _purge_conversation_files(conv_id, conv)
        log_action(
            "session_deleted",
            "conversation",
            conv_id,
            {"title": title, "hard_delete": True},
        )
        db.session.delete(conv)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[conversations/delete] error: {e}")
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Session permanently deleted", "conversation_id": conv_id}), 200


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
    allowed_text = {
        "patient_name", "patient_age", "patient_gender",
        "disease", "education", "emotional_state", "additional_notes",
        "patient_facing_summary", "prescription_instructions",
    }
    allowed_json = {"prescription_medicines", "prescription_tests"}

    try:
        summary = conv.summary
        if not summary:
            # No summary yet — create one so the user can add manual data
            summary = Summary(conversation_id=conv_id)
            db.session.add(summary)

        for field in allowed_text:
            if field in data:
                setattr(summary, field, (data[field] or "").strip() or None)

        for field in allowed_json:
            if field in data:
                val = data[field]
                setattr(summary, field, val if isinstance(val, list) else None)

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
        specialty = conv.user.specialty if conv.user else None
        recs = generate_recommendations(transcript_text, summary_data, specialty=specialty)
        return jsonify({"recommendations": recs}), 200
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"[recommend] error: {e}")
        return jsonify({"error": "Failed to generate recommendations."}), 500


# ── PDF export ───────────────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/export/pdf", methods=["GET"])
@require_auth
def export_pdf(conv_id: str):
    """
    Generate and stream a PDF for a session.

    Query:
      audience=clinical (default) — clinician-oriented note
      audience=patient — patient-facing plain-language PDF (layout locked to patient template version)
    """
    from flask import make_response
    from services.pdf_service import generate_session_pdf

    conv = Conversation.query.get(conv_id)
    if not conv or conv.deleted_at:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    audience = (request.args.get("audience") or "clinical").strip().lower()
    if audience not in ("clinical", "patient"):
        audience = "clinical"

    try:
        pdf_bytes = generate_session_pdf(conv, audience=audience)
        safe_title = (
            (conv.title or "session")
            .encode("latin-1", errors="replace")
            .decode("latin-1")
            .replace(" ", "_")
            .replace("—", "-")
            .replace("–", "-")
            [:40]
        )
        prefix = "patient_visit" if audience == "patient" else "clinical_note"
        filename = f"audient_{prefix}_{safe_title}_{conv.id[:8]}.pdf"

        response = make_response(pdf_bytes)
        response.headers["Content-Type"]        = "application/pdf"
        response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        response.headers["Content-Length"]      = len(pdf_bytes)

        log_action("pdf_exported", "conversation", conv_id, {"title": conv.title, "audience": audience})
        return response
    except Exception as e:
        print(f"[pdf] export error for {conv_id}: {e}")
        return jsonify({"error": "Could not generate PDF"}), 500


# ── Continue session ─────────────────────────────────────────────────────────

@conversations_bp.route("/<string:conv_id>/continue", methods=["POST"])
@require_auth
def continue_session(conv_id: str):
    """
    Create a continuation conversation linked to an existing completed one.

    Returns:
      session_id           — new conversation ID to pass to /live?continue=
      parent_id            — the original conversation ID
      context_seed         — capped tail of parent transcript (fed to Whisper rolling prompt)
      parent_summary       — extracted medical fields from parent (shown as context card)
      follow_up_questions  — AI-generated questions from parent (shown as checklist)
    """
    if not _db_available():
        return jsonify({"error": "Database not configured"}), 503

    parent = Conversation.query.get(conv_id)
    if not parent or parent.deleted_at:
        return jsonify({"error": "Original session not found"}), 404
    if parent.user_id and parent.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    try:
        cont = Conversation(
            user_id=g.user_id,
            title=f"Follow-up · {parent.title or _smart_title(None, [])}",
            status="processing",
            language=parent.language,
            parent_id=conv_id,
            is_offline=False,
            template_version_id=get_active_template_version_id(g.user_id),
            patient_template_version_id=get_active_template_version_id(g.user_id, "patient_facing"),
        )
        db.session.add(cont)
        db.session.commit()

        # ── Build context seed from parent transcript ──────────────────────
        # Tail of the parent's raw transcript is passed to Whisper as rolling
        # prompt context on the first chunk of the new session.
        context_seed = ""
        if parent.transcript:
            full_text = (parent.transcript.raw_text or "").strip()
            max_ctx = whisper_service.WHISPER_ROLLING_CONTEXT_MAX
            context_seed = full_text[-max_ctx:] if full_text else ""

        # ── Build parent summary context for the sidebar card ──────────────
        parent_summary = {}
        follow_up_questions = []
        if parent.summary:
            s = parent.summary
            parent_summary = {
                "patient_name":    s.patient_name,
                "patient_age":     s.patient_age,
                "patient_gender":  s.patient_gender,
                "disease":         s.disease,
                "additional_notes": s.additional_notes,
                "emotional_state": s.emotional_state,
            }
            follow_up_questions = s.follow_up_questions or []

        return jsonify({
            "session_id":           cont.id,
            "parent_id":            conv_id,
            "context_seed":         context_seed,
            "parent_summary":       parent_summary,
            "follow_up_questions":  follow_up_questions,
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@conversations_bp.route("/<string:conv_id>/continuations", methods=["GET"])
@require_auth
def list_continuations(conv_id: str):
    """
    Return all follow-up sessions that have this conversation as their parent.
    Used by SessionDetailPage to show "Follow-up sessions" on the parent card,
    and "Continuing from" metadata on the child card.
    """
    if not _db_available():
        return jsonify({"continuations": []}), 200

    parent = Conversation.query.get(conv_id)
    if not parent or parent.deleted_at:
        return jsonify({"error": "Session not found"}), 404
    if parent.user_id and parent.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    children = (
        Conversation.query
        .filter_by(parent_id=conv_id)
        .filter(Conversation.deleted_at.is_(None))
        .order_by(Conversation.created_at.asc())
        .all()
    )

    return jsonify({
        "continuations": [
            {
                "id":         c.id,
                "title":      c.title,
                "status":     c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in children
        ]
    }), 200


# ── Utility ──────────────────────────────────────────────────────────────────

def _db_available() -> bool:
    from config import Config
    return bool(Config.DATABASE_URL)
