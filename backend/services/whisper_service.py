"""
Whisper service — singleton faster-whisper model.
Loaded once at startup. All transcription calls go through transcribe().
"""
import os
from typing import List, Dict, Any

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        from config import Config

        hf_cache = Config.HF_HOME
        download_root = os.path.join(hf_cache, "hub")
        whisper_model = Config.WHISPER_MODEL

        print(f"[Whisper] Loading model '{whisper_model}' (device=cpu, compute=int8)")
        _model = WhisperModel(
            whisper_model,
            device="cpu",
            compute_type="int8",
            download_root=download_root,
        )
        print(f"[Whisper] Model ready.")
    return _model


def transcribe(audio_path: str, task: str = "translate") -> List[Dict[str, Any]]:
    """
    Transcribe audio file. Returns list of segment dicts.
    task='translate' → any language to English.
    task='transcribe' → keep original language.
    """
    model = _get_model()
    segments_gen, info = model.transcribe(audio_path, task=task)

    segments = []
    for seg in segments_gen:
        segments.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text or "",
            "speaker": "Speaker 1",  # default; overwritten by diarization
        })

    return segments
