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
    Run pyannote on the full accumulated session WAV.
    Assigns Speaker 1 / Speaker 2 labels to provided segments by timestamp.
    Called by the frontend every ~12 seconds during a live session.
    """
    data = request.get_json() or {}
    session_id = (data.get("session_id") or request.args.get("session_id") or "").strip()
    segments = data.get("segments") or []

    if not session_id or not audio_service.session_exists(session_id):
        return jsonify({"error": "session_id required and must be valid"}), 400

    if not Config.HF_TOKEN:
        return jsonify({"error": "HF_TOKEN not set — diarization unavailable"}), 400

    session = audio_service.get_session(session_id)
    wav_path = session["wav_path"]

    import os
    if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
        return jsonify({"segments": segments, "message": "Session audio too short"}), 200

    try:
        waveform, sample_rate = audio_service.load_waveform_mono(wav_path)
        duration = audio_service.duration_seconds(waveform, sample_rate)

        if duration < 0.5:
            return jsonify({"segments": segments}), 200

        annotation = diarize_service.diarize(
            waveform, sample_rate, min_speakers=2, max_speakers=3
        )
        if annotation is None:
            return jsonify({"segments": segments, "message": "Diarization unavailable"}), 200

        result, speaker_map = diarize_service.assign_speakers(segments, annotation)

        # Build debug stats
        speaker_counts: dict = {}
        for seg in result:
            sp = seg.get("speaker", "Unknown")
            speaker_counts[sp] = speaker_counts.get(sp, 0) + 1

        tracks = list(annotation.itertracks(yield_label=True))
        print(
            f"[session/diarize] duration={duration:.1f}s  "
            f"tracks={len(tracks)}  "
            f"segments={len(segments)}  "
            f"speakers={speaker_counts}"
        )

        return jsonify({
            "segments": result,
            "debug": {
                "session_duration_sec": round(duration, 1),
                "num_tracks": len(tracks),
                "speaker_counts": speaker_counts,
            },
        })

    except Exception as e:
        print(f"[session/diarize] error: {e}")
        return jsonify({"segments": segments, "error": str(e)}), 200
