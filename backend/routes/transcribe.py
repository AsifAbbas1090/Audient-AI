"""
Transcription routes:
  POST /api/transcribe   — transcribe an audio chunk
  POST /transcribe       — legacy alias (same handler)
  GET  /api/transcribe   — returns 405 with helpful message
"""
import os
import uuid
import json
import time

from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from config import Config
from services import audio_service, whisper_service, diarize_service

transcribe_bp = Blueprint("transcribe", __name__)


def _debug_log(message: str, data: dict, hypothesis_id: str) -> None:
    """Write a structured debug log entry."""
    log_path = os.path.join(os.path.dirname(__file__), "..", "debug.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(
            json.dumps({
                "timestamp": int(time.time() * 1000),
                "message": message,
                "data": data,
                "hypothesis": hypothesis_id,
            }) + "\n"
        )


@transcribe_bp.route("/transcribe", methods=["GET"])
@transcribe_bp.route("/api/transcribe", methods=["GET"])
def transcribe_get():
    return jsonify({"error": "Use POST multipart/form-data with field 'file'"}), 405


@transcribe_bp.route("/transcribe", methods=["POST"])
@transcribe_bp.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    """
    Transcribe an audio chunk (WebM or WAV).

    Form fields:
      file        — audio blob (required)
      translate   — "true" to translate to English (default: true)
      diarize     — "true" to run per-chunk speaker diarization
      session_id  — accumulate chunk into session WAV for full-session diarization
    """
    _debug_log("transcribe_audio entered", {"has_file": "file" in request.files}, "H1")

    if "file" not in request.files:
        return jsonify({"error": "file field is required"}), 400

    audio_file = request.files["file"]
    if not audio_file.filename:
        return jsonify({"error": "empty filename"}), 400

    # Save uploaded file to temp/
    original_name = secure_filename(audio_file.filename)
    base_name, ext = os.path.splitext(original_name)
    if not base_name:
        base_name = str(uuid.uuid4())
    ext = (ext or "").lower()

    input_path = os.path.join(Config.TEMP_DIR, f"{base_name}{ext}")
    audio_file.save(input_path)
    _debug_log("File saved", {"path": input_path, "size": os.path.getsize(input_path)}, "H2")

    # Parse request params
    def _bool_param(key: str) -> bool:
        return (
            request.args.get(key, "").lower() == "true"
            or request.form.get(key, "").lower() == "true"
        )

    translate = _bool_param("translate")
    diarize = _bool_param("diarize") or _bool_param("runtime")
    session_id = (request.args.get("session_id") or request.form.get("session_id") or "").strip()

    temp_files_to_remove = []

    try:
        # Convert to WAV if needed
        wav_path = audio_service.ensure_wav(input_path)
        if wav_path != input_path:
            temp_files_to_remove.append(wav_path)

        # Silence check — skip silent/empty chunks
        if audio_service.is_silent(wav_path):
            _debug_log("Silent audio — skipping", {}, "H3")
            return jsonify({"segments": [], "text": ""}), 200

        # Accumulate chunk into session WAV (for session-level diarization)
        if session_id and audio_service.session_exists(session_id):
            audio_service.append_chunk_to_session(session_id, wav_path)

        # Transcribe
        task = "translate" if translate else "transcribe"
        _debug_log("Transcribing", {"task": task}, "H4")
        segments = whisper_service.transcribe(input_path, task=task)
        full_text = " ".join(s["text"].strip() for s in segments).strip()
        _debug_log("Transcription done", {"segments": len(segments)}, "H4")

        # Diarization: not available without HF_TOKEN
        if diarize and not Config.HF_TOKEN:
            return jsonify({
                "segments": segments,
                "text": full_text,
                "diarization_skipped": "HF_TOKEN not set. Add it in .env.",
            })

        # Session diarization: labels come from /api/session/diarize poll — skip here
        if diarize and session_id:
            return jsonify({"segments": segments, "text": full_text})

        # Per-chunk diarization (ASR page — no session_id)
        if diarize and Config.HF_TOKEN:
            try:
                waveform, sample_rate = audio_service.load_waveform_mono(wav_path)
                duration = audio_service.duration_seconds(waveform, sample_rate)

                if duration < 0.5:
                    return jsonify({"segments": [], "text": ""}), 200

                annotation = diarize_service.diarize(
                    waveform, sample_rate, min_speakers=1, max_speakers=2
                )
                if annotation is not None:
                    result, _ = diarize_service.assign_speakers(segments, annotation)
                    _debug_log("Diarization done", {"segments": len(result)}, "H5")
                    return jsonify({"segments": result, "text": full_text})

            except Exception as e:
                print(f"[transcribe] per-chunk diarization failed: {e}")
                return jsonify({
                    "segments": segments,
                    "text": full_text,
                    "diarization_skipped": f"Diarization error: {e}",
                })

        _debug_log("Returning segments (no diarize)", {"segments": len(segments)}, "H5")
        return jsonify({"segments": segments, "text": full_text})

    except Exception as e:
        print(f"[transcribe] error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"segments": [], "text": "", "error": str(e)}), 200

    finally:
        for f in temp_files_to_remove:
            try:
                if os.path.exists(f):
                    os.remove(f)
            except Exception:
                pass
