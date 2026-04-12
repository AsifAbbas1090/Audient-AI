"""
Transcription service — Groq Whisper API (online).
Uses whisper-large-v3 via Groq's free API tier.
Falls back gracefully if GROQ_API_KEY is not set.
"""
import os
from typing import List, Dict, Any


def transcribe(audio_path: str, task: str = "translate") -> Dict[str, Any]:
    """
    Transcribe audio using Groq Whisper API.
    task='translate'   → any language to English (uses translations endpoint)
    task='transcribe'  → keep original language

    Returns dict:
      {
        "segments": [{ "start": float, "end": float, "text": str, "speaker": "Speaker 1" }],
        "language": str  (detected language, "Unknown" for translate task)
      }
    """
    from config import Config

    if not Config.GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY not set. Get a free key at https://console.groq.com"
        )

    from groq import Groq
    client = Groq(api_key=Config.GROQ_API_KEY)

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    filename = os.path.basename(audio_path)

    if task == "translate":
        response = client.audio.translations.create(
            file=(filename, audio_bytes),
            model=Config.GROQ_TRANSCRIBE_MODEL,
            response_format="verbose_json",
        )
    else:
        response = client.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model=Config.GROQ_TRANSCRIBE_MODEL,
            response_format="verbose_json",
        )

    language = getattr(response, "language", None) or ("Unknown" if task == "translate" else "Unknown")

    segments = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start":   float(getattr(seg, "start", 0)),
                "end":     float(getattr(seg, "end",   0)),
                "text":    (getattr(seg, "text", "") or "").strip(),
                "speaker": "Speaker 1",  # overwritten by diarization if available
            })

    # Groq's translations endpoint sometimes returns segment objects with
    # empty .text but the full transcript on response.text.
    # Fall back to response.text whenever no segment has actual text.
    has_text = any(s["text"] for s in segments)
    if not has_text:
        full_text = (getattr(response, "text", "") or "").strip()
        if full_text:
            # Re-use any timestamps from the empty segments if available
            start = segments[0]["start"] if segments else 0.0
            end   = segments[-1]["end"]  if segments else 0.0
            segments = [{
                "start":   start,
                "end":     end,
                "text":    full_text,
                "speaker": "Speaker 1",
            }]

    return {"segments": segments, "language": language}
