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
    # Always use a UUID prefix so concurrent requests never share a path.
    # (Two chunks named "speech.webm" arriving simultaneously would collide.)
    ext           = os.path.splitext(secure_filename(audio_file.filename or "audio.webm"))[1] or ".webm"
    original_name = f"{uuid.uuid4()}{ext}"
    input_path    = os.path.join(Config.TEMP_DIR, original_name)
    audio_file.save(input_path)

    # ── Parse params ─────────────────────────────────────────────
    def _bool(key: str) -> bool:
        return (
            request.args.get(key, "").lower() == "true"
            or request.form.get(key, "").lower() == "true"
        )

    translate  = _bool("translate")
    diarize    = _bool("diarize")
    session_id = (request.args.get("session_id") or request.form.get("session_id") or "").strip()

    try:
        file_size = os.path.getsize(input_path)
        print(f"[transcribe] file={original_name} size={file_size}B translate={translate} diarize={diarize}")

        # ── Silence / empty check ────────────────────────────────
        if audio_service.is_silent(input_path):
            print(f"[transcribe] SILENT (size={file_size}B < 500B) — skipping Groq")
            return jsonify({"segments": [], "text": ""}), 200

        # ── Track session (no WAV accumulation in online mode) ───
        if session_id and audio_service.session_exists(session_id):
            pass  # session tracking only; diarization handled server-side when offline

        # ── Transcribe via Groq ──────────────────────────────────
        task      = "translate" if translate else "transcribe"
        result    = whisper_service.transcribe(input_path, task=task)
        segments  = result["segments"]
        language  = result.get("language", "Unknown")
        full_text = " ".join(s["text"].strip() for s in segments if s.get("text")).strip()
        print(f"[transcribe] Groq → language={language} segments={len(segments)} text_len={len(full_text)}")

        # ── Speaker diarization ──────────────────────────────────
        # For full recordings (ASR page) with enough segments, use
        # Groq LLM to assign Doctor / Patient labels in one pass.
        # Live session chunks are too short for useful per-chunk labels;
        # the frontend polls /api/session/diarize every 12 s instead.
        diarization_note = None
        if diarize and len(segments) >= 2:
            from services import diarize_service
            if Config.GROQ_API_KEY:
                segments = diarize_service.diarize_with_groq(segments)
                diarization_note = "Speaker labels assigned via Groq LLM."
            else:
                diarization_note = "Set GROQ_API_KEY or HF_TOKEN to enable speaker labels."

        response_body: dict = {
            "segments": segments,
            "text":     full_text,
            "language": language,
        }
        if diarization_note:
            response_body["diarization_note"] = diarization_note

        return jsonify(response_body)

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
