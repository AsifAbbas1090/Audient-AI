"""
Background task: process a completed live session.

Pipeline — optimised for minimum wall-clock time:

  Phase 1 (parallel)  diarize  ──┐
                      extract  ──┴─► both Groq calls run at the same time

  Phase 2 (serial)    save transcript + summary row + field reminders

  Phase 3            mark complete + session_ready + email

  Phase 4 (async)    follow-up questions via tasks/enrich_summary.py

Diarization is skipped entirely when the live session already assigned
Doctor/Patient labels (it diarizes every 15 s during recording).
"""
from __future__ import annotations

import gc
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.exc import OperationalError

from celery_app import celery


# ── Helpers ──────────────────────────────────────────────────────────────────

def _already_diarized(segments: list) -> bool:
    """True when the live session has already labeled ≥50 % of segments."""
    if not segments:
        return True
    labeled = sum(
        1 for s in segments
        if s.get("speaker") and s["speaker"] not in ("Speaker 1", "Speaker 2", "")
    )
    return labeled >= len(segments) * 0.5


def _raw_text(segments: list) -> str:
    return " ".join((s.get("text") or "").strip() for s in segments if s.get("text")).strip()


def _normalize_segments(segments: list) -> list:
    """Avoid empty transcript crashes: guarantee at least one line for DB + extraction."""
    original = [dict(s) for s in (segments or [])]
    if _raw_text(original).strip():
        return original
    if original:
        out = []
        for s in original:
            d = dict(s)
            if not (d.get("text") or "").strip():
                d["text"] = "(No speech captured.)"
            out.append(d)
        return out
    return [{"speaker": "Speaker 1", "text": "(No speech captured.)", "start": 0.0, "end": 0.0}]


def _emit_session_terminal(conv_id: str, *, ok: bool, error: str | None = None) -> None:
    try:
        from extensions import socketio

        payload = {
            "conversation_id": conv_id,
            "session_id": conv_id,
            "status": "complete" if ok else "failed",
        }
        if error:
            payload["error"] = error[:400]
        socketio.emit("session_ready" if ok else "session_failed", payload, room=conv_id)
    except Exception as e:
        print(f"[task] terminal ws emit failed: {e}")


def _mark_failed(conv_id: str, err: str | None = None) -> None:
    from extensions import db
    from models.conversation import Conversation

    try:
        c = Conversation.query.get(conv_id)
        if not c:
            return
        c.status = "failed"
        c.processing_started_at = None
        db.session.commit()
        _emit_session_terminal(conv_id, ok=False, error=err or "processing_failed")
    except Exception as e:
        db.session.rollback()
        print(f"[task] mark_failed DB error {conv_id}: {e}")


def _celery_retryable(exc: BaseException) -> bool:
    return isinstance(exc, OperationalError)


# ── Celery task ───────────────────────────────────────────────────────────────

@celery.task(
    bind=True,
    max_retries=1,
    name="tasks.process_session",
    soft_time_limit=270,
    time_limit=310,
)
def process_session_task(
    self,
    conv_id:  str,
    segments: list,
    language: str,
    duration: int | None,
):
    from app import app as flask_app

    flask_app.app_context().push()
    from extensions import db
    from models.conversation import Conversation
    from services.diarize_service import (
        diarize_with_groq,
        expand_segments_for_diarization,
        collapse_labeled_segments,
    )
    from services.extract_service import extract
    from routes.conversations import (
        _save_transcript,
        _save_summary,
        _generate_field_reminders,
        _smart_title,
        _merge_parent_summary_into_extraction,
    )

    conv = Conversation.query.get(conv_id)
    if not conv:
        return {"error": "Conversation not found"}

    t0 = time.time()

    def elapsed():
        return f"{time.time() - t0:.1f}s"

    specialty = conv.user.specialty if conv.user else None

    try:
        original = _normalize_segments(segments)
        expanded, group_sizes = expand_segments_for_diarization(original)
        text = _raw_text(original)
        skip_diar = _already_diarized(original) or len(original) < 2

        segments = [dict(s) for s in original]

        print(
            f"[task] {conv_id} | segments={len(original)} expanded={len(expanded)} "
            f"skip_diar={skip_diar}"
        )

        # ── Phase 1: diarize + extract in parallel ────────────────────────
        with ThreadPoolExecutor(max_workers=2, thread_name_prefix="p1") as pool:
            diar_fut = (
                None if skip_diar
                else pool.submit(
                    diarize_with_groq, expanded, None, str(conv_id)
                )
            )
            extr_fut = (
                pool.submit(extract, text, specialty, str(conv_id)) if text else None
            )

            labeled_expanded = None
            if diar_fut:
                try:
                    labeled_expanded = diar_fut.result(timeout=120)
                    segments = collapse_labeled_segments(
                        original, labeled_expanded, group_sizes
                    )
                    print(f"[task] diarize done @ {elapsed()}")
                except Exception as e:
                    print(f"[task] diarize failed: {e}")

            extraction: dict = {}
            if extr_fut:
                try:
                    extraction = extr_fut.result(timeout=120)
                    print(f"[task] extract done @ {elapsed()}")
                except Exception as e:
                    print(f"[task] extract failed: {e}")

            if (
                diar_fut
                and labeled_expanded is not None
                and not extraction.get("error")
                and not extraction.get("skipped")
            ):
                labeled = "\n".join(
                    f"[{s.get('speaker', 'Speaker')}] {(s.get('text') or '').strip()}"
                    for s in segments if (s.get("text") or "").strip()
                )
                if labeled:
                    try:
                        re_ext = extract(labeled, specialty)
                        if re_ext and not re_ext.get("error") and not re_ext.get("skipped"):
                            for k, v in re_ext.items():
                                if v and v != "null" and not extraction.get(k):
                                    extraction[k] = v
                            print(f"[task] re-extract done @ {elapsed()}")
                    except Exception as e:
                        print(f"[task] re-extract failed: {e}")

        # ── Phase 2: persist transcript (idempotent — replace existing rows) ──
        conv = Conversation.query.get(conv_id)
        if not conv:
            raise RuntimeError("Conversation disappeared mid-task")

        if conv.transcript:
            db.session.delete(conv.transcript)
            db.session.flush()
        _save_transcript(conv_id, segments, language=language)
        print(f"[task] transcript saved @ {elapsed()}")

        good_extraction = (
            extraction
            and not extraction.get("skipped")
            and not extraction.get("error")
        )

        if good_extraction:
            extraction = _merge_parent_summary_into_extraction(conv, extraction)

            if conv.summary:
                db.session.delete(conv.summary)
                db.session.flush()

            _save_summary(conv_id, extraction, followups=[])
            db.session.flush()

            s = conv.summary
            if s:
                _generate_field_reminders(s)

        # ── Phase 3: finalise ─────────────────────────────────────────────
        conv.status = "complete"
        conv.processing_started_at = None
        conv.title = _smart_title(
            extraction if good_extraction else None,
            segments,
            conv.created_at,
        )
        conv.language = language or conv.language or "Unknown"
        if duration:
            conv.duration = duration

        db.session.commit()
        print(f"[task] {conv_id} complete in {elapsed()}")

        _send_notifications(conv)
        _emit_session_terminal(conv_id, ok=True)

        if good_extraction:
            from tasks.enrich_summary import dispatch_enrich

            dispatch_enrich(flask_app, conv_id)

        gc.collect()
        return {"success": True, "conversation_id": conv_id}

    except SoftTimeLimitExceeded as exc:
        db.session.rollback()
        _mark_failed(conv_id, "processing_timed_out")
        print(f"[task] {conv_id} SOFT TIME LIMIT @ {elapsed()}: {exc}")
        raise

    except Exception as exc:
        db.session.rollback()
        if self.request.retries < self.max_retries and _celery_retryable(exc):
            print(f"[task] {conv_id} DB retry @ {elapsed()}: {exc}")
            raise self.retry(exc=exc, countdown=12)

        _mark_failed(conv_id, str(exc))
        print(f"[task] {conv_id} FAILED @ {elapsed()}: {exc}")
        raise


# ── Email notifications ───────────────────────────────────────────────────────

def _send_notifications(conv) -> None:
    try:
        from config import Config
        from models.user import User
        from services.email_service import notify_session_complete, notify_field_alert

        if not Config.RESEND_API_KEY:
            return

        owner = User.query.get(conv.user_id) if conv.user_id else None
        if not owner or not owner.email:
            return

        summary_dict = conv.summary.to_dict() if conv.summary else {}
        notify_session_complete(
            to_email=owner.email,
            conv_id=conv.id,
            title=conv.title or "Untitled Session",
            summary=summary_dict,
            app_url=Config.APP_URL,
        )

        if conv.summary and conv.summary.field_reminders:
            missing = [
                r.field_name.replace("_", " ").title()
                for r in conv.summary.field_reminders
                if not r.is_resolved and r.severity == "critical"
            ]
            if missing:
                notify_field_alert(
                    to_email=owner.email,
                    conv_id=conv.id,
                    title=conv.title or "Untitled Session",
                    missing=missing,
                    app_url=Config.APP_URL,
                )
    except Exception as e:
        print(f"[task/email] {conv.id}: {e}")


# ── Dispatch helper ───────────────────────────────────────────────────────────

def dispatch(
    app,
    conv_id:  str,
    segments: list,
    language: str,
    duration: int | None,
) -> str | None:
    from config import Config

    if Config.REDIS_URL:
        try:
            result = process_session_task.apply_async(
                args=[conv_id, segments, language, duration],
                countdown=0,
            )
            return result.id
        except Exception as e:
            print(f"[dispatch] Celery broker unreachable ({e}) — falling back to daemon thread")

    def _run():
        with app.app_context():
            try:
                process_session_task.apply(args=(conv_id, segments, language, duration))
            except Exception as e:
                print(f"[thread] {conv_id} failed: {e}")
                try:
                    from models.conversation import Conversation as Conv
                    from extensions import db as _db

                    c = Conv.query.get(conv_id)
                    if c and c.status == "processing":
                        c.status = "failed"
                        c.processing_started_at = None
                        _db.session.commit()
                except Exception as db_e:
                    print(f"[thread] could not mark failed: {db_e}")

    threading.Thread(target=_run, daemon=True).start()
    return None
