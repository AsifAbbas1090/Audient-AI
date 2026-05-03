"""
Deferred session enrichment — runs after the conversation is already complete.

Generates follow-up questions only (patient-facing narrative/handout disabled — patient PDF uses extracted fields).
Without REDIS_URL this runs in a daemon thread (never Celery-eager inline).
"""
from __future__ import annotations

import threading

from celery_app import celery


def _enrich_summary_impl(conv_id: str) -> None:
    """Must run inside Flask app_context."""
    from extensions import db
    from models.conversation import Conversation
    from services.extract_service import generate_followups

    conv = Conversation.query.get(conv_id)
    if not conv or conv.status != "complete":
        return
    if not conv.summary or not conv.transcript:
        return

    s = conv.summary
    tr = conv.transcript
    text = (tr.raw_text or "").strip()
    if not text:
        return

    specialty = conv.user.specialty if conv.user else None
    extraction = s.extracted_entities if isinstance(s.extracted_entities, dict) else {}

    need_followups = not (s.follow_up_questions and len(s.follow_up_questions) > 0)
    if not need_followups:
        return

    try:
        followups = generate_followups(text, extraction, specialty) or []
    except Exception as e:
        print(f"[enrich] followups {conv_id[:8]}: {e}")
        return

    if not followups:
        return

    try:
        s.follow_up_questions = followups
        db.session.commit()
        print(f"[enrich] {conv_id[:8]} saved followups")
    except Exception as e:
        db.session.rollback()
        print(f"[enrich] commit {conv_id[:8]}: {e}")
        return

    try:
        from extensions import socketio

        socketio.emit(
            "session_enriched",
            {"conversation_id": conv_id, "session_id": conv_id},
            room=conv_id,
        )
    except Exception as e:
        print(f"[enrich] emit {conv_id[:8]}: {e}")


def run_enrich_summary(conv_id: str) -> None:
    """Celery worker path — pushes app context."""
    from app import app as flask_app

    with flask_app.app_context():
        _enrich_summary_impl(conv_id)


@celery.task(name="tasks.enrich_summary", soft_time_limit=90, time_limit=110)
def enrich_summary_task(conv_id: str) -> None:
    run_enrich_summary(conv_id)


def dispatch_enrich(app, conv_id: str) -> None:
    """Queue enrichment — Celery when Redis configured, else daemon thread."""
    from config import Config

    if Config.REDIS_URL:
        enrich_summary_task.apply_async(args=[conv_id])
    else:

        def _run():
            with app.app_context():
                try:
                    _enrich_summary_impl(conv_id)
                except Exception as e:
                    print(f"[enrich/thread] {conv_id[:8]}: {e}")

        threading.Thread(target=_run, daemon=True).start()
