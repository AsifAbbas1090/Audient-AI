"""
Audio service — lightweight file utilities and session management.
torchaudio/torch removed for online mode (Groq accepts audio directly).
"""
import os
from typing import Optional

from config import Config

# In-memory session store: { session_id: { "wav_path": str } }
_sessions: dict = {}


# ── Session management ───────────────────────────────────────────────────────

def create_session(session_id: str) -> str:
    wav_path = os.path.join(Config.SESSIONS_DIR, f"{session_id}.wav")
    _sessions[session_id] = {"wav_path": wav_path}
    return wav_path


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


def append_chunk_to_session(session_id: str, chunk_path: str) -> None:
    """No-op in online mode — session WAV accumulation requires torchaudio."""
    pass


# ── File utilities ───────────────────────────────────────────────────────────

def ensure_wav(input_path: str) -> str:
    """
    Convert audio to WAV using FFmpeg if needed.
    In online mode (Groq) this is skipped — Groq accepts WebM directly.
    Kept here for offline fallback compatibility.
    """
    if input_path.lower().endswith(".wav"):
        return input_path

    import subprocess
    import shutil

    ffmpeg = Config.FFMPEG_PATH or shutil.which("ffmpeg") or "ffmpeg"
    wav_path = os.path.splitext(input_path)[0] + "_converted.wav"

    result = subprocess.run(
        [ffmpeg, "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr[-300:]}")
    return wav_path


def is_silent(file_path: str, min_bytes: int = 500) -> bool:
    """
    Lightweight silence check by file size.
    Files under min_bytes are almost certainly silent/empty.
    """
    try:
        return os.path.getsize(file_path) < min_bytes
    except OSError:
        return True


def load_waveform_mono(wav_path: str):
    """Stub — requires torchaudio (offline mode only)."""
    raise RuntimeError("load_waveform_mono requires torchaudio (offline mode)")


def duration_seconds(waveform, sample_rate: int) -> float:
    """Stub — requires torchaudio (offline mode only)."""
    raise RuntimeError("duration_seconds requires torchaudio (offline mode)")
