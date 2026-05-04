"""
Audio service — file utilities and session management.

Session WAV accumulation:
  Chunks are converted to mono 16kHz WAV and appended to a per-session file
  in SESSIONS_DIR.  This accumulated file is what pyannote.audio reads for
  audio-based speaker diarization.

  In online-only mode (no HF_TOKEN) the WAV is still written so it can be
  used in the future without code changes — it just won't be read.
"""
import os
import numpy as np
import soundfile as sf
from typing import Optional

from config import Config

# In-memory session store: { session_id: { "wav_path": str } }
_sessions: dict = {}

# Target sample rate for pyannote / Whisper
_TARGET_SR = 16_000


# ── Session management ───────────────────────────────────────────────────────

def create_session(session_id: str, specialty: str = "general_mbbs") -> str:
    from services.groq_key_pool import assign_key_index_for_new_session

    wav_path = os.path.join(Config.SESSIONS_DIR, f"{session_id}.wav")
    _sessions[session_id] = {
        "wav_path": wav_path,
        "specialty": specialty,
        "groq_key_index": assign_key_index_for_new_session(),
    }
    return wav_path


def get_session_specialty(session_id: str) -> str:
    """Return the doctor specialty stored at session start, or general_mbbs."""
    session = _sessions.get(session_id)
    if not session:
        return "general_mbbs"
    return session.get("specialty", "general_mbbs")


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


def append_chunk_to_session(session_id: str, chunk_path: str) -> None:
    """
    Convert chunk to 16kHz mono WAV (via ffmpeg) and append its PCM data
    to the session's accumulated WAV file.  Used by pyannote diarization.
    Silently skips on any error so transcription is never blocked.
    """
    session = _sessions.get(session_id)
    if not session:
        return

    wav_path = session["wav_path"]

    # Convert chunk to WAV
    try:
        converted = _to_wav_16k(chunk_path)
    except Exception as e:
        print(f"[audio] chunk convert failed: {e}")
        return

    try:
        # Read the new chunk
        new_data, sr = sf.read(converted, dtype="float32", always_2d=False)

        # Append to existing session WAV (or create it)
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:
            existing, _ = sf.read(wav_path, dtype="float32", always_2d=False)
            combined = np.concatenate([existing, new_data])
        else:
            combined = new_data

        sf.write(wav_path, combined, _TARGET_SR)

    except Exception as e:
        print(f"[audio] append_chunk failed: {e}")
    finally:
        # Remove the temporary converted WAV (intermediate file)
        if converted != chunk_path and os.path.exists(converted):
            try:
                os.remove(converted)
            except OSError:
                pass
        # Remove the original chunk — caller set tmp_path=None to signal ownership transfer
        if chunk_path and os.path.exists(chunk_path):
            try:
                os.remove(chunk_path)
            except OSError:
                pass


# ── File utilities ───────────────────────────────────────────────────────────

def ensure_wav(input_path: str) -> str:
    """Convert audio to WAV using FFmpeg if needed."""
    if input_path.lower().endswith(".wav"):
        return input_path
    return _to_wav_16k(input_path)


def _to_wav_16k(input_path: str) -> str:
    """
    Convert any audio file to 16kHz mono WAV via FFmpeg.
    Returns the path to the converted file.
    """
    import subprocess
    import shutil

    ffmpeg = Config.FFMPEG_PATH or shutil.which("ffmpeg") or "ffmpeg"
    wav_out = os.path.splitext(input_path)[0] + "_16k.wav"

    cmd = [
        ffmpeg, "-y",
        "-i", input_path,
        "-ar", str(_TARGET_SR),
        "-ac", "1",
        "-f", "wav",
        wav_out,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg conversion failed: {result.stderr[-300:]}")
    return wav_out


def is_silent(file_path: str, rms_threshold: float = 0.005) -> bool:
    """
    Silence check using RMS energy on the decoded audio signal.
    Falls back to a file-size guard if soundfile can't decode the format
    (e.g. raw WebM before FFmpeg conversion).
    """
    try:
        if os.path.getsize(file_path) < 200:
            return True
        data, _ = sf.read(file_path, dtype="float32", always_2d=False)
        if data.size == 0:
            return True
        rms = float(np.sqrt(np.mean(data ** 2)))
        return rms < rms_threshold
    except Exception:
        # soundfile can't decode WebM — fall back to size heuristic
        try:
            return os.path.getsize(file_path) < 500
        except OSError:
            return True


# ── Waveform loading (for pyannote) ──────────────────────────────────────────

def load_waveform_mono(wav_path: str):
    """
    Load a WAV file as a mono torchaudio tensor.
    Returns (waveform, sample_rate) where waveform has shape [1, N].

    Requires: pip install torch torchaudio
    Raises ImportError if torchaudio is not installed.

    On Windows, torchaudio may delegate decoding to TorchCodec; if those DLLs fail to load,
    falls back to soundfile + torch (same tensor layout pyannote expects).
    """
    try:
        import torch
        import torchaudio
    except ImportError:
        raise ImportError(
            "torchaudio is required for pyannote diarization.\n"
            "Install: pip install torch torchaudio"
        )

    waveform = None
    sample_rate = _TARGET_SR

    try:
        waveform, sample_rate = torchaudio.load(wav_path)
    except Exception as e:
        print(f"[audio] torchaudio.load failed ({e}); using soundfile → torch fallback")
        data, sample_rate = sf.read(wav_path, dtype="float32", always_2d=False)
        if getattr(data, "ndim", 0) > 1:
            data = np.mean(data, axis=1)
        waveform = torch.from_numpy(np.ascontiguousarray(data)).unsqueeze(0)

    # Mix down to mono if multi-channel
    if waveform.shape[0] > 1:
        waveform = torch.mean(waveform, dim=0, keepdim=True)

    # Resample to 16kHz if needed
    if sample_rate != _TARGET_SR:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sample_rate, new_freq=_TARGET_SR
        )
        waveform = resampler(waveform)
        sample_rate = _TARGET_SR

    return waveform, sample_rate


def duration_seconds(waveform, sample_rate: int) -> float:
    """Return duration of a torchaudio waveform tensor in seconds."""
    return waveform.shape[-1] / sample_rate
