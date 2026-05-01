"""
Background task: process a completed live session.

Pipeline — optimised for minimum wall-clock time:

  Phase 1 (parallel)  diarize  ──┐
                      extract  ──┴─► both Groq calls run at the same time

  Phase 2 (serial)    save transcript + create summary row

  Phase 3 (parallel)  followups        ──┐
                      patient-facing   ──┴─► both Groq calls run at the same time

  Phase 4 (serial)    field reminders, mark complete, email

Diarization is skipped entirely when the live session already assigned
Doctor/Patient labels (it diarizes every 15 s during recording).
"""
from __future__ import annotations
import time
import threading
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_EXCEPTION
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


# ── Celery task ───────────────────────────────────────────────────────────────

@celery.task(bind=True, max_retries=1, name="tasks.process_session")
def process_session_task(
    self,
    conv_id:  str,
    segments: list,
    language: str,
    duration: int | None,
):
    from extensions import db
    from models.conversation import Conversation
    from services.diarize_service import diarize_with_groq, split_segments_by_sentence
    from services.extract_service import extract, generate_followups
    from services.patient_facing_service import generate_patient_facing_summary
    from routes.conversations import (
        _save_transcript,
        _save_summary,
        _generate_field_reminders,
        _auto_title,
    )

    conv = Conversation.query.get(conv_id)
    if not conv:
        return {"error": "Conversation not found"}

    t0      = time.time()
    specialty = conv.user.specialty if conv.user else None

    def elapsed():
        return f"{time.time() - t0:.1f}s"

    try:
        # ── Prepare ───────────────────────────────────────────────────────
        segments  = split_segments_by_sentence(segments)
        text      = _raw_text(segments)
        skip_diar = _already_diarized(segments) or len(segments) < 2

        print(f"[task] {conv_id} | segments={len(segments)} skip_diar={skip_diar}")

        # ── Phase 1: diarize + extract in parallel ────────────────────────
        with ThreadPoolExecutor(max_workers=2, thread_name_prefix="p1") as pool:
            diar_fut = (
                None if skip_diar
                else pool.submit(diarize_with_groq, segments)
            )
            extr_fut = pool.submit(extract, text, specialty) if text else None

            if diar_fut:
                try:
                    segments = diar_fut.result(timeout=35)
                    print(f"[task] diarize done @ {elapsed()}")
                except Exception as e:
                    print(f"[task] diarize failed: {e}")

            extraction: dict = {}
            if extr_fut:
                try:
                    extraction = extr_fut.result(timeout=35)
                    print(f"[task] extract done @ {elapsed()}")
                except Exception as e:
                    print(f"[task] extract failed: {e}")

            # Re-extract with speaker-labeled text after diarization so the LLM
            # can distinguish patient-said vs doctor-said (better Name, EmotionalState).
            if diar_fut and not extraction.get("error") and not extraction.get("skipped"):
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

        # ── Phase 2: persist transcript ───────────────────────────────────
        if conv.transcript:
            db.session.delete(conv.transcript)
            db.session.flush()
        _save_transcript(conv_id, segments, language=language)
        print(f"[task] transcript saved @ {elapsed()}")

        # ── Phase 3: followups + patient-facing in parallel ───────────────
        good_extraction = (
            extraction
            and not extraction.get("skipped")
            and not extraction.get("error")
        )

        if good_extraction:
            if conv.summary:
                db.session.delete(conv.summary)
                db.session.flush()

            # Create summary row now so field-reminders can reference it
            _save_summary(conv_id, extraction, followups=[])
            db.session.flush()

            # Build plain-dict snapshot for threads (no SQLAlchemy objects)
            summary_data = {
                "patient_name":   extraction.get("Name"),
                "patient_age":    extraction.get("Age"),
                "patient_gender": extraction.get("Gender"),
                "disease":        extraction.get("Disease"),
                "education":      extraction.get("Education"),
                "emotional_state":extraction.get("EmotionalState"),
                "additional_notes":extraction.get("AdditionalNotes"),
            }

            followups     : list       = []
            patient_facing: str | None = None

            with ThreadPoolExecutor(max_workers=2, thread_name_prefix="p3") as pool:
                fol_fut = pool.submit(generate_followups, text, extraction, specialty)
                pf_fut  = pool.submit(
                    generate_patient_facing_summary, text, summary_data, specialty
                )

                try:
                    followups = fol_fut.result(timeout=35) or []
                    print(f"[task] followups done @ {elapsed()}")
                except Exception as e:
                    print(f"[task] followups failed: {e}")

                try:
                    patient_facing = pf_fut.result(timeout=35)
                    print(f"[task] patient_facing done @ {elapsed()}")
                except Exception as e:
                    print(f"[task] patient_facing failed: {e}")

            # Apply threaded results back onto the summary row
            s = conv.summary
            if s:
                if followups:
                    s.follow_up_questions = followups
                if patient_facing:
                    s.patient_facing_summary = patient_facing
                _generate_field_reminders(s)

        # ── Phase 4: finalise ─────────────────────────────────────────────
        conv.status   = "complete"
        conv.title    = conv.title or _auto_title(segments)
        conv.language = language or conv.language or "Unknown"
        if duration:
            conv.duration = duration

        db.session.commit()
        print(f"[task] {conv_id} complete in {elapsed()}")

        _send_notifications(conv)

        # Push a WebSocket event so the frontend can navigate immediately
        # instead of waiting for the 2-second HTTP poll cycle.
        try:
            from extensions import socketio
            socketio.emit("session_ready", {"conversation_id": conv_id}, room=conv_id)
        except Exception as e:
            print(f"[task] session_ready emit failed: {e}")

        return {"success": True, "conversation_id": conv_id}

    except Exception as exc:
        db.session.rollback()
        try:
            conv.status = "failed"
            db.session.commit()
        except Exception:
            db.session.rollback()
        print(f"[task] {conv_id} FAILED @ {elapsed()}: {exc}")
        raise self.retry(exc=exc, countdown=5) if self.request.retries < 1 else exc


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
        result = process_session_task.apply_async(
            args=[conv_id, segments, language, duration],
            countdown=0,
        )
        return result.id
    else:
        def _run():
            with app.app_context():
                try:
                    process_session_task(conv_id, segments, language, duration)
                except Exception as e:
                    print(f"[thread] {conv_id} failed: {e}")

        threading.Thread(target=_run, daemon=True).start()
        return None
