"""
Offline-first: faster-whisper large-v3 (any language → English) + Ollama (medical extraction).
Two-person diarization via pyannote when HF_TOKEN is set. No WhisperX alignment models.
"""
import os
os.environ["HF_HOME"] = "E:/Asif/huggingface_cache"

import numpy as np
import torch
import torchaudio
import subprocess
import shutil
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import uuid
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Hardcode ffmpeg path for subprocess (pydub removed — not compatible with Python 3.13)
FFMPEG_PATH = r"C:\Users\HardStudy\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0-full_build\bin\ffmpeg.exe"

app = Flask(__name__)
CORS(app)

os.makedirs('temp', exist_ok=True)
SESSIONS_DIR = os.path.join('temp', 'sessions')
os.makedirs(SESSIONS_DIR, exist_ok=True)
# session_id -> {"wav_path": str}
_sessions = {}

print(f"FFmpeg found at: {shutil.which('ffmpeg')}")


def _append_chunk_to_session(session_id: str, chunk_wav_path: str) -> None:
    """Append chunk WAV to session's accumulated WAV (16kHz mono)."""
    if session_id not in _sessions:
        return
    wav_path = _sessions[session_id]["wav_path"]
    if not os.path.exists(chunk_wav_path):
        return
    if not os.path.exists(wav_path):
        shutil.copy2(chunk_wav_path, wav_path)
        return
    try:
        wav_sess, sr_sess = torchaudio.load(wav_path)
    except Exception as e:
        print(f"Session append: failed to load session wav {wav_path}: {e}")
        return
    try:
        wav_chunk, sr_chunk = torchaudio.load(chunk_wav_path)
    except Exception as e:
        print(f"Session append: failed to load chunk wav {chunk_wav_path}: {e}")
        return
    if wav_sess.shape[0] > 1:
        wav_sess = torch.mean(wav_sess, dim=0, keepdim=True)
    if wav_chunk.shape[0] > 1:
        wav_chunk = torch.mean(wav_chunk, dim=0, keepdim=True)
    if sr_sess != sr_chunk:
        from torchaudio.transforms import Resample
        resampler = Resample(sr_chunk, sr_sess)
        wav_chunk = resampler(wav_chunk)
    combined = torch.cat([wav_sess, wav_chunk], dim=1)
    torchaudio.save(wav_path, combined, sr_sess)

# faster-whisper: model from env (base/small = faster, large-v3 = more accurate but ~2 min on CPU)
HF_CACHE = os.environ.get("HF_HOME", "E:/Asif/huggingface_cache")
DOWNLOAD_ROOT = os.path.join(HF_CACHE, "hub")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base").strip() or "base"
from faster_whisper import WhisperModel
fw_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8", download_root=DOWNLOAD_ROOT)

# Diarization (lazy-loaded when HF_TOKEN set)
HF_TOKEN = os.getenv('HF_TOKEN', os.getenv('HUGGINGFACE_TOKEN', '')).strip()
_diarize_pipeline = None


def _get_diarize_pipeline():
    global _diarize_pipeline
    if _diarize_pipeline is None:
        from pyannote.audio import Pipeline
        hf_token = os.getenv("HF_TOKEN", os.getenv("HUGGINGFACE_TOKEN", "")).strip()
        _diarize_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=hf_token,
        )
    return _diarize_pipeline


def _ensure_wav(input_path: str) -> str:
    if input_path.lower().endswith('.wav'):
        return input_path

    wav_path = os.path.splitext(input_path)[0] + '_converted.wav'

    result = subprocess.run([
        FFMPEG_PATH, '-y',
        '-i', input_path,
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        wav_path
    ], capture_output=True, text=True)

    print(f"FFmpeg returncode: {result.returncode}")
    if result.returncode != 0:
        raise Exception(f"FFmpeg failed: {result.stderr[-300:] if result.stderr else 'unknown'}")

    return wav_path


def _assign_speakers_to_segments(segments, diarization):
    speaker_timeline = []
    annotation = diarization.speaker_diarization
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        speaker_timeline.append({"start": turn.start, "end": turn.end, "speaker": speaker})
    result = []
    for seg in segments:
        mid = (seg["start"] + seg["end"]) / 2
        speaker = "SPEAKER_00"
        for t in speaker_timeline:
            if t["start"] <= mid <= t["end"]:
                speaker = t["speaker"]
                break
        result.append({**seg, "speaker": speaker})
    return result


# Extraction: Ollama only (offline)
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434/v1').strip()
OLLAMA_EXTRACT_MODEL = os.getenv('OLLAMA_EXTRACT_MODEL', 'llama3.1').strip() or 'llama3.1'


def _ollama_client():
    return OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama"), OLLAMA_EXTRACT_MODEL


@app.route('/api/extract', methods=['POST'])
def extract_info():
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400

    try:
        client, model_name = _ollama_client()
    except Exception:
        return jsonify({"skipped": True, "reason": "Ollama not available. Start with: ollama run llama3.1"}), 200

    transcription = data['text']

    try:
        prompt = f"""
        Extract medical data from the text into a valid JSON object.

        STRICT RULES:
        1. Mutual Exclusivity: If a condition is listed in "Disease", do NOT mention it in "AdditionalNotes".
        2. "Disease" Field: Contains ONLY the name of the diagnosed condition (e.g., "Diabetes", "Flu").
        3. "AdditionalNotes" Field: Contains context, medicines, duration, or habits. It must NOT restate the disease name.

        Return ONLY a JSON object with these keys:
        - "Name" (string or null)
        - "Age" (string or null)
        - "Gender" (string or null)
        - "Disease" (string or null): The specific condition name.
        - "Education" (string or null)
        - "EmotionalState" (string or null): Mood/feeling (e.g. "Anxious").
        - "AdditionalNotes" (string or null): Meds, symptoms, timeline. NO DISEASE NAMES.

        Text: "{transcription}"
        """
        completion = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are a helpful medical assistant. Reply with only a JSON object, no markdown."},
                {"role": "user", "content": prompt}
            ],
        )
        content = (completion.choices[0].message.content or "{}").strip()
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        content = content.rsplit("```", 1)[0].strip()
        extracted_data = json.loads(content)
        return jsonify(extracted_data)
    except json.JSONDecodeError as e:
        print(f"Extract JSON parse error: {e}")
        return jsonify({"error": "Model did not return valid JSON"}), 500
    except Exception as e:
        print(f"Error extracting info: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
@app.route('/api/config', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "mode": "offline",
        "extraction_available": True,
    })


@app.route('/api/session/start', methods=['POST'])
def session_start():
    """Create a new session for accumulating audio; diarization runs on full session later."""
    session_id = str(uuid.uuid4())
    wav_path = os.path.join(SESSIONS_DIR, f"{session_id}.wav")
    _sessions[session_id] = {"wav_path": wav_path}
    return jsonify({"session_id": session_id})


@app.route('/api/session/diarize', methods=['POST'])
def session_diarize():
    """Run pyannote on full session WAV and return segments with speaker labels (by timestamp)."""
    data = request.get_json() or {}
    session_id = (data.get("session_id") or request.args.get("session_id") or "").strip()
    segments = data.get("segments") or []
    if not session_id or session_id not in _sessions:
        return jsonify({"error": "session_id required and must be valid"}), 400
    if not HF_TOKEN:
        return jsonify({"error": "HF_TOKEN not set"}), 400
    wav_path = _sessions[session_id]["wav_path"]
    if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
        return jsonify({"segments": segments, "message": "Session audio too short"}), 200
    try:
        pipeline = _get_diarize_pipeline()
        waveform, sample_rate = torchaudio.load(wav_path)
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        duration_sec = waveform.shape[1] / float(sample_rate)
        if duration_sec < 0.5:
            return jsonify({"segments": segments}), 200
        audio_input = {"waveform": waveform, "sample_rate": sample_rate}
        # Force at least 2 speakers, allow up to 3
        diarization = pipeline(audio_input, min_speakers=2, max_speakers=3)
        annotation = diarization.speaker_diarization
        print(f"Session duration: {duration_sec:.1f}s")
        tracks = list(annotation.itertracks(yield_label=True))
        print(f"Tracks found: {len(tracks)}")
        speaker_timeline = []
        for turn, _, speaker in tracks:
            print(f"  {speaker}: {turn.start:.1f}s-{turn.end:.1f}s")
            speaker_timeline.append({"start": turn.start, "end": turn.end, "speaker": speaker})
        result = []
        for seg in segments:
            start = seg.get("start", 0)
            end = seg.get("end", 0)
            mid = (start + end) / 2
            speaker = "SPEAKER_00"
            for t in speaker_timeline:
                if t["start"] <= mid <= t["end"]:
                    speaker = t["speaker"]
                    break
            result.append({**seg, "speaker": speaker})
        speaker_map = {}
        for seg in result:
            sp = seg["speaker"]
            if sp not in speaker_map:
                speaker_map[sp] = f"Speaker {len(speaker_map) + 1}"
            seg["speaker"] = speaker_map[sp]
        speaker_counts = {}
        for seg in result:
            speaker_counts[seg["speaker"]] = speaker_counts.get(seg["speaker"], 0) + 1
        print(f"[session/diarize] session_duration_sec={duration_sec:.1f} num_tracks={len(speaker_timeline)} segments_sent={len(segments)} speaker_counts={speaker_counts}")
        return jsonify({
            "segments": result,
            "debug": {
                "session_duration_sec": round(duration_sec, 1),
                "num_tracks": len(speaker_timeline),
                "speaker_counts": speaker_counts,
            },
        })
    except Exception as e:
        print(f"Session diarize error: {e}")
        return jsonify({"segments": segments, "error": str(e)}), 200


@app.route('/transcribe', methods=['GET'])
@app.route('/api/transcribe', methods=['GET'])
def transcribe_get():
    return jsonify({"error": "Use POST multipart/form-data with field 'file'"}), 405


def _debug_log(message, data, hypothesis_id):
    import time
    log_path = os.path.join(os.path.dirname(__file__), "..", "debug-e3f9e8.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps({"sessionId": "e3f9e8", "timestamp": int(time.time() * 1000), "location": "app.py:transcribe_audio", "message": message, "data": data, "hypothesisId": hypothesis_id}) + "\n")


@app.route('/transcribe', methods=['POST'])
@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    # #region agent log
    _debug_log("transcribe_audio entered", {"has_files": "file" in request.files}, "H1")
    # #endregion
    if 'file' not in request.files:
        _debug_log("Return 400: no file in request", {}, "H2")
        return jsonify({"error": "file field is required"}), 400

    audio_file = request.files['file']
    if audio_file.filename == '':
        _debug_log("Return 400: empty filename", {}, "H2")
        return jsonify({"error": "empty filename"}), 400

    original_name = secure_filename(audio_file.filename)
    base_name, ext = os.path.splitext(original_name)
    if not base_name:
        base_name = str(uuid.uuid4())
    ext = (ext or '').lower()

    input_path = os.path.join('temp', f"{base_name}{ext}")
    audio_file.save(input_path)
    file_size = os.path.getsize(input_path) if os.path.exists(input_path) else 0
    _debug_log("File saved", {"input_path": input_path, "file_size": file_size}, "H5")

    # Skip empty or silent audio to avoid model crash (e.g. silent chunks from frontend)
    try:
        load_path = input_path
        if not input_path.lower().endswith('.wav'):
            load_path = _ensure_wav(input_path)
        waveform, sr = torchaudio.load(load_path)
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        audio = waveform.numpy().flatten().astype(np.float32)
        max_abs = float(np.max(np.abs(audio))) if len(audio) > 0 else 0.0
        if audio is None or len(audio) == 0 or max_abs < 0.001:
            _debug_log("Early return: empty/silent audio", {"len_audio": len(audio), "max_abs": max_abs}, "H3")
            return jsonify({"segments": [], "text": ""}), 200
    except Exception as e:
        _debug_log("Silent check exception (continuing)", {"error": str(e)}, "H3a")

    translate = request.args.get('translate', type=lambda x: x.lower() == 'true') or (
        request.form.get('translate', '').lower() == 'true'
    )
    diarize = request.args.get('diarize', type=lambda x: x.lower() == 'true') or (
        request.args.get('runtime', type=lambda x: x.lower() == 'true') or
        request.form.get('diarize', '').lower() == 'true' or
        request.form.get('runtime', '').lower() == 'true'
    )
    session_id = (request.args.get("session_id") or request.form.get("session_id") or "").strip()

    # When using session-level diarization, append this chunk's WAV to the session
    temp_wav_to_remove = None
    if session_id and session_id in _sessions:
        chunk_wav = _ensure_wav(input_path)
        _append_chunk_to_session(session_id, chunk_wav)
        if os.path.abspath(chunk_wav) != os.path.abspath(input_path):
            temp_wav_to_remove = chunk_wav
    try:
        try:
            _debug_log("Calling fw_model.transcribe", {"input_path": input_path, "task": "translate"}, "H4")
            # faster-whisper large-v3: any language → English (task="translate")
            segments_gen, info = fw_model.transcribe(input_path, task="translate")
            result_segments = []
            for segment in segments_gen:
                result_segments.append({
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text or "",
                    "speaker": "Speaker 1",
                })
            full_text = " ".join((s["text"] or "").strip() for s in result_segments).strip()
            _debug_log("Transcribe done", {"num_segments": len(result_segments), "full_text_len": len(full_text)}, "H4")

            # Diarization only when HF_TOKEN is set (pyannote requires Hugging Face token + model agreement)
            if diarize and not HF_TOKEN:
                _debug_log("Diarization skipped: no HF_TOKEN", {}, "D1")
                return jsonify({
                    "segments": result_segments,
                    "text": full_text,
                    "diarization_skipped": "HF_TOKEN not set. Add it in .env and accept pyannote/speaker-diarization-3.1 on Hugging Face.",
                })

            # Session-level diarization: labels come from POST /api/session/diarize, not per-chunk
            if diarize and session_id:
                _debug_log("Return 200 (session diarize)", {"num_segments": len(result_segments)}, "H5")
                return jsonify({"segments": result_segments, "text": full_text})

            if diarize and HF_TOKEN:
                # Per-chunk diarization (only when no session_id)
                diarize_path = _ensure_wav(input_path)
                if os.path.abspath(diarize_path) != os.path.abspath(input_path):
                    temp_wav_to_remove = diarize_path
                try:
                    pipeline = _get_diarize_pipeline()

                    # Load audio as tensor (mono) instead of passing file path
                    waveform, sample_rate = torchaudio.load(diarize_path)
                    if waveform.shape[0] > 1:
                        waveform = torch.mean(waveform, dim=0, keepdim=True)

                    # Skip very short chunks (< 0.5s) to avoid empty/unstable diarization
                    if waveform.shape[1] / sample_rate < 0.5:
                        return jsonify({"segments": [], "text": ""}), 200

                    audio_input = {"waveform": waveform, "sample_rate": sample_rate}

                    diarization = pipeline(audio_input, min_speakers=1, max_speakers=2)
                    segments_list = [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in result_segments]
                    segments_with_speakers = _assign_speakers_to_segments(segments_list, diarization)
                    speaker_map = {}
                    out_segments = []
                    for seg in segments_with_speakers:
                        sp = seg["speaker"]
                        if sp not in speaker_map:
                            speaker_map[sp] = f"Speaker {len(speaker_map) + 1}"
                        out_segments.append({
                            "speaker": speaker_map[sp],
                            "text": seg["text"],
                            "start": seg["start"],
                            "end": seg["end"],
                        })
                    _debug_log("Return 200 success (diarized)", {"num_segments": len(out_segments), "text_len": len(full_text)}, "H5")
                    return jsonify({"segments": out_segments, "text": full_text})
                except Exception as e:
                    _debug_log("Diarization failed, fallback to Speaker 1", {"error": str(e)}, "D2")
                    print(f"Diarization failed, falling back to single speaker: {e}")
                    return jsonify({
                        "segments": result_segments,
                        "text": full_text,
                        "diarization_skipped": f"Diarization failed: {e}. Accept pyannote/speaker-diarization-3.1 and pyannote/segmentation-3.0 on Hugging Face.",
                    })

            if diarize:
                _debug_log("Return 200 success (diarize)", {"num_segments": len(result_segments), "text_len": len(full_text)}, "H5")
                return jsonify({"segments": result_segments, "text": full_text})
            _debug_log("Return 200 success (no diarize)", {"num_segments": len(result_segments), "text_len": len(full_text)}, "H5")
            return jsonify({"segments": result_segments, "text": full_text})
        except Exception as e:
            _debug_log("Transcribe exception", {"error": str(e)}, "H2")
            print(f"Transcribe error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                "segments": [],
                "text": "",
                "error": str(e),
            }), 200
    finally:
        if temp_wav_to_remove and os.path.exists(temp_wav_to_remove):
            try:
                os.remove(temp_wav_to_remove)
            except Exception:
                pass


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    app.run(host='0.0.0.0', port=port)
