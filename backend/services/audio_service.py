"""
Audio service — FFmpeg conversion, silence detection, and
in-memory session audio accumulation.
"""
import os
import shutil
import subprocess
from typing import Optional

import numpy as np
import torch
import torchaudio

from config import Config

# In-memory session store: { session_id: { "wav_path": str } }
# Sessions accumulate audio chunks into a single WAV for full-session diarization.
_sessions: dict = {}


# ------------------------------------------------------------------ #
# Session management                                                   #
# ------------------------------------------------------------------ #

def create_session(session_id: str) -> str:
    """Register a new session and return the WAV path it will accumulate to."""
    wav_path = os.path.join(Config.SESSIONS_DIR, f"{session_id}.wav")
    _sessions[session_id] = {"wav_path": wav_path}
    return wav_path


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


def append_chunk_to_session(session_id: str, chunk_wav_path: str) -> None:
    """Append a WAV chunk to the session's accumulated WAV (16kHz mono)."""
    if not session_exists(session_id):
        return
    wav_path = _sessions[session_id]["wav_path"]
    if not os.path.exists(chunk_wav_path):
        return

    # First chunk — just copy it
    if not os.path.exists(wav_path):
        shutil.copy2(chunk_wav_path, wav_path)
        return

    try:
        wav_sess, sr_sess = torchaudio.load(wav_path)
    except Exception as e:
        print(f"[Audio] Failed to load session wav: {e}")
        return

    try:
        wav_chunk, sr_chunk = torchaudio.load(chunk_wav_path)
    except Exception as e:
        print(f"[Audio] Failed to load chunk wav: {e}")
        return

    # Ensure mono
    if wav_sess.shape[0] > 1:
        wav_sess = torch.mean(wav_sess, dim=0, keepdim=True)
    if wav_chunk.shape[0] > 1:
        wav_chunk = torch.mean(wav_chunk, dim=0, keepdim=True)

    # Resample chunk if needed
    if sr_sess != sr_chunk:
        from torchaudio.transforms import Resample
        wav_chunk = Resample(sr_chunk, sr_sess)(wav_chunk)

    combined = torch.cat([wav_sess, wav_chunk], dim=1)
    torchaudio.save(wav_path, combined, sr_sess)


# ------------------------------------------------------------------ #
# FFmpeg conversion                                                    #
# ------------------------------------------------------------------ #

def ensure_wav(input_path: str) -> str:
    """
    Convert any audio format to 16kHz mono WAV using FFmpeg.
    Returns the WAV path (may be same as input if already WAV).
    """
    if input_path.lower().endswith(".wav"):
        return input_path

    wav_path = os.path.splitext(input_path)[0] + "_converted.wav"
    result = subprocess.run(
        [
            Config.FFMPEG_PATH, "-y",
            "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-f", "wav",
            wav_path,
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg conversion failed: {result.stderr[-300:] if result.stderr else 'unknown'}"
        )

    return wav_path


# ------------------------------------------------------------------ #
# Silence detection                                                    #
# ------------------------------------------------------------------ #

def is_silent(wav_path: str, threshold: float = 0.001) -> bool:
    """Return True if the audio is silent or empty (skip transcription)."""
    try:
        waveform, _ = torchaudio.load(wav_path)
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        audio = waveform.numpy().flatten().astype(np.float32)
        if len(audio) == 0:
            return True
        return float(np.max(np.abs(audio))) < threshold
    except Exception:
        return False


def load_waveform_mono(wav_path: str):
    """Load a WAV as a mono tensor. Returns (waveform, sample_rate)."""
    waveform, sr = torchaudio.load(wav_path)
    if waveform.shape[0] > 1:
        waveform = torch.mean(waveform, dim=0, keepdim=True)
    return waveform, sr


def duration_seconds(waveform, sample_rate: int) -> float:
    return waveform.shape[1] / float(sample_rate)
