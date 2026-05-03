"""
Session routes:
  POST /api/session/start    — create a new live session
  POST /api/session/diarize  — run full-session diarization
"""
import uuid
from flask import Blueprint, request, jsonify, g
from config import Config
from services import audio_service, diarize_service, whisper_service
from utils.auth import optional_auth

sessions_bp = Blueprint("sessions", __name__)


@sessions_bp.route("/api/session/start", methods=["POST"])
@optional_auth
def session_start():
    """
    Create a new session for accumulating audio chunks.
    Returns a session_id the frontend passes with every chunk.

    Optional body fields:
      session_id    — pre-created ID to reuse (e.g. from /continue endpoint)
      context_seed  — tail of a parent session's transcript (capped); pre-loaded
                      into the rolling Whisper prompt so the first chunk starts
                      in-context rather than cold.
    """
    body = request.get_json(silent=True) or {}

    # Use a pre-created ID when continuing from an existing session, otherwise generate fresh
    session_id = (body.get("session_id") or "").strip() or str(uuid.uuid4())
    audio_service.create_session(session_id)

    # Pre-seed the Whisper rolling context so the first chunk of a follow-up
    # session continues naturally from the end of the parent transcript.
    context_seed = (body.get("context_seed") or "").strip()
    if context_seed:
        from routes.socket_handlers import _session_context
        max_ctx = whisper_service.WHISPER_ROLLING_CONTEXT_MAX
        _session_context[session_id] = context_seed[-max_ctx:]
        print(f"[session/start] Seeded context for {session_id[:8]} ({len(context_seed)} chars)")

    # Persist a Conversation record when DB is configured (with or without auth)
    user_id = getattr(g, "user_id", None)
    if Config.DATABASE_URL:
        try:
            from extensions import db
            from models.conversation import Conversation
            # Only create a new row if one doesn't already exist (pre-created by /continue)
            if not Conversation.query.get(session_id):
                conv = Conversation(id=session_id, user_id=user_id, status="processing", is_offline=False)
                db.session.add(conv)
                db.session.commit()
                print(f"[session/start] Conversation {session_id} created (user_id={user_id})")
        except Exception as e:
            db.session.rollback()
            print(f"[session/start] Could not persist conversation: {e}")

    return jsonify({"session_id": session_id})


@sessions_bp.route("/api/session/diarize", methods=["POST"])
def session_diarize():
    """
    Assign Speaker 1 / Speaker 2 labels to transcript segments.
    Called by the frontend every ~12 seconds during a live session.

    Priority:
      1. pyannote (offline, audio-based) — requires HF_TOKEN + pyannote.audio
      2. Groq LLM (online, text-based)   — requires GROQ_API_KEY
      3. Return segments unchanged        — neither available
    """
    data       = request.get_json() or {}
    session_id = (data.get("session_id") or request.args.get("session_id") or "").strip()
    segments   = data.get("segments") or []

    if not session_id or not audio_service.session_exists(session_id):
        return jsonify({"error": "session_id required and must be valid"}), 400

    # ── Path 1: pyannote (offline audio-based) ──────────────────────────────
    if Config.HF_TOKEN:
        import os
        from services.diarize_service import wait_pyannote_pipeline_ready

        if wait_pyannote_pipeline_ready(timeout=120.0):
            session  = audio_service.get_session(session_id)
            wav_path = session["wav_path"]

            if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
                pass
            else:
                try:
                    waveform, sample_rate = audio_service.load_waveform_mono(wav_path)
                    duration = audio_service.duration_seconds(waveform, sample_rate)

                    if duration >= 0.5:
                        annotation = diarize_service.diarize(
                            waveform, sample_rate, min_speakers=2, max_speakers=3
                        )
                        if annotation is not None:
                            result, _ = diarize_service.assign_speakers(segments, annotation)
                            speaker_counts: dict = {}
                            for seg in result:
                                sp = seg.get("speaker", "Unknown")
                                speaker_counts[sp] = speaker_counts.get(sp, 0) + 1
                            tracks = list(annotation.itertracks(yield_label=True))
                            print(
                                f"[session/diarize/pyannote] duration={duration:.1f}s  "
                                f"tracks={len(tracks)}  speakers={speaker_counts}"
                            )
                            return jsonify({"segments": result, "method": "pyannote"})
                except Exception as e:
                    print(f"[session/diarize/pyannote] error: {e} — falling back to Groq LLM")

    # ── Path 2: Groq LLM (online text-based) ────────────────────────────────
    if Config.GROQ_API_KEY:
        try:
            result = diarize_service.diarize_with_groq(segments)
            speaker_counts = {}
            for seg in result:
                sp = seg.get("speaker", "Unknown")
                speaker_counts[sp] = speaker_counts.get(sp, 0) + 1
            print(f"[session/diarize/groq] segments={len(segments)} speakers={speaker_counts}")
            return jsonify({"segments": result, "method": "groq_llm"})
        except Exception as e:
            print(f"[session/diarize/groq] error: {e}")

    # ── Path 3: nothing available ────────────────────────────────────────────
    return jsonify({"segments": segments, "message": "No diarization method available"}), 200


@sessions_bp.route("/api/session/correction", methods=["POST"])
@optional_auth
def log_correction():
    """
    Log a live-session speaker correction made by the doctor.
    Corrections are stored for future model improvement — not used to update
    the transcript in real time (the frontend handles that locally).

    Body:
      session_id  — the live session UUID
      action      — 'doctor' | 'patient' | 'remove'
    """
    data       = request.get_json() or {}
    session_id = (data.get("session_id") or "").strip()
    action     = (data.get("action")     or "").strip()

    if action not in ("doctor", "patient", "remove"):
        return jsonify({"error": "action must be doctor | patient | remove"}), 400

    print(f"[correction] session={session_id[:8] if session_id else '?'} action={action}")

    # Persist to DB when available — simple audit log entry
    from config import Config
    if Config.DATABASE_URL and session_id:
        try:
            from utils.audit import log_action
            log_action("speaker_correction", "conversation", session_id, {"action": action})
        except Exception:
            pass  # non-critical — correction is already applied in the frontend

    return jsonify({"logged": True}), 200


@sessions_bp.route("/api/session/llm_correct", methods=["POST"])
@optional_auth
def session_llm_correct():
    """
    POST /api/session/llm_correct

    Background LLM speaker-correction checkpoint.  Called by the frontend
    every ~25 s during a live session with a sliding window of recent segments.

    Body:
      session_id  — active session UUID
      segments    — list of {id, speaker, text}  (last N, max 30)
      context     — optional {"doctor_label": str, "patient_label": str}

    Returns:
      {"corrections": [{id, speaker}, ...], "context": {...}}
      or {"skipped": true} / {"error": "..."}
    """
    data       = request.get_json() or {}
    session_id = (data.get("session_id") or "").strip()
    segments   = data.get("segments") or []
    context    = data.get("context") or None

    if not session_id:
        return jsonify({"error": "session_id required"}), 400
    if not segments:
        return jsonify({"skipped": True, "reason": "No segments"}), 200

    from services import llm_correct_service
    result = llm_correct_service.correct_speakers(segments, context)
    return jsonify(result), 200
