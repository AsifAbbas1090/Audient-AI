"""
Session routes:
  POST /api/session/start    — create a new live session
  POST /api/session/diarize  — run full-session diarization
"""
import uuid
from flask import Blueprint, request, jsonify, g
from config import Config
from services import audio_service, diarize_service
from utils.auth import optional_auth

sessions_bp = Blueprint("sessions", __name__)


@sessions_bp.route("/api/session/start", methods=["POST"])
@optional_auth
def session_start():
    """
    Create a new session for accumulating audio chunks.
    Returns a session_id the frontend passes with every chunk.
    If authenticated, associates the session with the user's account.
    """
    session_id = str(uuid.uuid4())
    audio_service.create_session(session_id)

    # Persist a Conversation record when DB is configured and user is authenticated
    user_id = getattr(g, "user_id", None)
    if user_id:
        try:
            from extensions import db
            from models.conversation import Conversation
            conv = Conversation(id=session_id, user_id=user_id, status="processing")
            db.session.add(conv)
            db.session.commit()
        except Exception as e:
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
        session  = audio_service.get_session(session_id)
        wav_path = session["wav_path"]

        if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
            # Audio too short — fall through to LLM path
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
