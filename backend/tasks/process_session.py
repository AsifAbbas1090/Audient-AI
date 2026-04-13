"""
Background task: process a completed live session.

Pipeline (runs in Celery worker or daemon thread):
  1. Diarize segments (Groq LLM — assign Doctor/Patient labels)
  2. Extract medical fields (Groq LLaMA)
  3. Save transcript + summary to DB
  4. Generate field reminders
  5. Update conversation status to "complete"

If REDIS_URL is not set (no Celery worker), `dispatch()` runs this
logic in a background daemon thread so /complete returns immediately.
"""
from __future__ import annotations
import threading
from celery_app import celery


# ── The actual Celery task ───────────────────────────────────────────────────

@celery.task(bind=True, max_retries=1, name="tasks.process_session")
def process_session_task(
    self,
    conv_id:  str,
    segments: list,
    language: str,
    duration: int | None,
):
    """
    Celery task.  Runs inside a Flask app context (wired in app.py).
    Imports are deferred so this module loads cleanly without a running app.
    """
    from extensions import db
    from models.conversation import Conversation
    from services.diarize_service import diarize_with_groq
    from services.extract_service import extract
    from routes.conversations import (
        _save_transcript,
        _save_summary,
        _generate_field_reminders,
        _auto_title,
    )

    conv = Conversation.query.get(conv_id)
    if not conv:
        return {"error": "Conversation not found"}

    try:
        # ── Step 1: diarize ──────────────────────────────────────────────
        if len(segments) >= 2:
            segments = diarize_with_groq(segments)

        # ── Step 2: extract medical fields ───────────────────────────────
        raw_text  = " ".join((s.get("text") or "").strip() for s in segments if s.get("text"))
        extraction = extract(raw_text) if raw_text.strip() else {}

        # ── Step 3: persist transcript ───────────────────────────────────
        # Remove any existing transcript (idempotent re-save)
        if conv.transcript:
            db.session.delete(conv.transcript)
            db.session.flush()
        _save_transcript(conv_id, segments, language=language)

        # ── Step 4: persist summary + reminders ──────────────────────────
        if not extraction.get("skipped") and not extraction.get("error"):
            if conv.summary:
                db.session.delete(conv.summary)
                db.session.flush()
            _save_summary(conv_id, extraction)

        db.session.flush()
        if conv.summary:
            _generate_field_reminders(conv.summary)

        # ── Step 5: mark complete ─────────────────────────────────────────
        conv.status   = "complete"
        conv.title    = conv.title or _auto_title(segments)
        conv.language = language or conv.language or "Unknown"
        if duration:
            conv.duration = duration

        db.session.commit()
        print(f"[task] process_session {conv_id} → complete")
        return {"success": True, "conversation_id": conv_id}

    except Exception as exc:
        db.session.rollback()
        # Mark as failed so the frontend can show an error state
        try:
            conv.status = "failed"
            db.session.commit()
        except Exception:
            db.session.rollback()
        print(f"[task] process_session {conv_id} → FAILED: {exc}")
        raise self.retry(exc=exc, countdown=5) if self.request.retries < 1 else exc


# ── Dispatch helper ─────────────────────────────────────────────────────────

def dispatch(
    app,
    conv_id:  str,
    segments: list,
    language: str,
    duration: int | None,
) -> str | None:
    """
    Send the task to the queue (Celery) or run it in a daemon thread (no Redis).

    Returns the Celery task_id string, or None in thread mode.
    Callers should not block on the result — poll /api/conversations/:id/status.
    """
    from config import Config

    if Config.REDIS_URL:
        # True background queue — Celery worker picks it up
        result = process_session_task.apply_async(
            args=[conv_id, segments, language, duration],
            countdown=0,
        )
        return result.id
    else:
        # No Redis — run in a daemon thread so the HTTP response still
        # returns immediately while processing happens in the background.
        def _run():
            with app.app_context():
                try:
                    process_session_task(conv_id, segments, language, duration)
                except Exception as e:
                    print(f"[thread] process_session {conv_id} failed: {e}")

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return None
