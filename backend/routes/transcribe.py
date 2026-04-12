"""
Transcription routes:
  POST /api/transcribe  — transcribe an audio chunk via Groq Whisper API
  GET  /api/transcribe  — returns 405 with helpful message
"""
import os
import uuid

from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from config import Config
from services import audio_service, whisper_service

transcribe_bp = Blueprint("transcribe", __name__)


@transcribe_bp.route("/transcribe", methods=["GET"])
@transcribe_bp.route("/api/transcribe", methods=["GET"])
def transcribe_get():
    return jsonify({"error": "Use POST multipart/form-data with field 'file'"}), 405


@transcribe_bp.route("/transcribe", methods=["POST"])
@transcribe_bp.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    """
    Transcribe an audio chunk (WebM, WAV, MP3, etc.) via Groq Whisper.

    Form fields:
      file       — audio blob (required)
      translate  — "true" to translate any language → English (default: true)
      diarize    — "true" to attempt speaker labelling (graceful if unavailable)
      session_id — associate chunk with a session (for session tracking)
    """
    if "file" not in request.files:
        return jsonify({"error": "file field is required"}), 400

    audio_file = request.files["file"]
    if not audio_file.filename:
        return jsonify({"error": "empty filename"}), 400

    if not Config.GROQ_API_KEY:
        return jsonify({"error": "GROQ_API_KEY not set — add it to .env"}), 503

    # ── Save uploaded file ───────────────────────────────────────
    original_name = secure_filename(audio_file.filename) or f"{uuid.uuid4()}.webm"
    input_path    = os.path.join(Config.TEMP_DIR, original_name)
    audio_file.save(input_path)

    # ── Parse params ─────────────────────────────────────────────
    def _bool(key: str) -> bool:
        return (
            request.args.get(key, "").lower() == "true"
            or request.form.get(key, "").lower() == "true"
        )

    translate  = _bool("translate")
    session_id = (request.args.get("session_id") or request.form.get("session_id") or "").strip()

    try:
        # ── Silence / empty check ────────────────────────────────
        if audio_service.is_silent(input_path):
            return jsonify({"segments": [], "text": ""}), 200

        # ── Track session (no WAV accumulation in online mode) ───
        if session_id and audio_service.session_exists(session_id):
            pass  # session tracking only; diarization handled server-side when offline

        # ── Transcribe via Groq ──────────────────────────────────
        task   = "translate" if translate else "transcribe"
        result = whisper_service.transcribe(input_path, task=task)
        segments  = result["segments"]
        language  = result.get("language", "Unknown")
        full_text = " ".join(s["text"].strip() for s in segments if s.get("text")).strip()

        return jsonify({
            "segments":            segments,
            "text":                full_text,
            "language":            language,
            "diarization_skipped": "Speaker diarization requires HF_TOKEN (offline setup).",
        })

    except Exception as e:
        print(f"[transcribe] error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"segments": [], "text": "", "error": str(e)}), 200

    finally:
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except Exception:
            pass
