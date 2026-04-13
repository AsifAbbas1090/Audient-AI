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
from typing import Optional

from config import Config

# In-memory session store: { session_id: { "wav_path": str } }
_sessions: dict = {}

# Target sample rate for pyannote / Whisper
_TARGET_SR = 16_000


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
        import soundfile as sf

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
        # Remove the temporary converted file (not the original chunk_path)
        if converted != chunk_path and os.path.exists(converted):
            try:
                os.remove(converted)
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


def is_silent(file_path: str, min_bytes: int = 500) -> bool:
    """Lightweight silence check by file size."""
    try:
        return os.path.getsize(file_path) < min_bytes
    except OSError:
        return True


# ── Waveform loading (for pyannote) ──────────────────────────────────────────

def load_waveform_mono(wav_path: str):
    """
    Load a WAV file as a mono torchaudio tensor.
    Returns (waveform, sample_rate) where waveform has shape [1, N].

    Requires: pip install torch torchaudio
    Raises ImportError if torchaudio is not installed.
    """
    try:
        import torchaudio
        import torch
    except ImportError:
        raise ImportError(
            "torchaudio is required for pyannote diarization.\n"
            "Install: pip install torch torchaudio"
        )

    waveform, sample_rate = torchaudio.load(wav_path)

    # Mix down to mono if multi-channel
    if waveform.shape[0] > 1:
        import torch
        waveform = torch.mean(waveform, dim=0, keepdim=True)

    # Resample to 16kHz if needed
    if sample_rate != _TARGET_SR:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sample_rate, new_freq=_TARGET_SR
        )
        waveform     = resampler(waveform)
        sample_rate  = _TARGET_SR

    return waveform, sample_rate


def duration_seconds(waveform, sample_rate: int) -> float:
    """Return duration of a torchaudio waveform tensor in seconds."""
    return waveform.shape[-1] / sample_rate
