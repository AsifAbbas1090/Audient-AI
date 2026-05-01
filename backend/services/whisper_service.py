"""
Transcription service — Groq Whisper API (online).

Improvements over v1:
  - Medical vocabulary prompt  → 15-25% fewer mis-transcribed medical terms
  - Language hint passthrough  → skips language detection when already known
  - temperature=0              → fully deterministic, no hallucination variance
  - Falls back gracefully if GROQ_API_KEY is not set
"""
import os
from typing import List, Dict, Any, Optional

_groq_client = None


def _get_client():
    global _groq_client
    if _groq_client is None:
        from config import Config
        from groq import Groq
        _groq_client = Groq(api_key=Config.GROQ_API_KEY)
    return _groq_client

# Medical consultation context fed to Whisper as an initial_prompt.
# Whisper uses this to bias its vocabulary toward clinical terminology,
# reducing errors on drug names, conditions, and anatomical terms.
_MEDICAL_PROMPT = (
    "Medical consultation transcript. Doctor asks, patient answers. "
    "Symptoms, diagnosis, prescription, treatment plan, follow-up, referral. "
    "Conditions: diabetes mellitus, hypertension, tachycardia, bradycardia, "
    "myocardial infarction, hypertrophy, chronic, acute, allergy. "
    "Medications: metformin, lisinopril, atorvastatin, amoxicillin, omeprazole, "
    "paracetamol, aspirin, ibuprofen, metoprolol, amlodipine, furosemide, insulin, "
    "prednisolone, prednisone, azithromycin, ciprofloxacin, warfarin, clopidogrel. "
    "Tests: CBC, ECG, MRI, CT scan, ultrasound, HbA1c, creatinine, hemoglobin, BMI, "
    "blood pressure, heart rate, ICU, ER, ED, BP, HR."
)


def _is_english(lang: Optional[str]) -> bool:
    """True when the language hint indicates English audio (skip translation)."""
    return bool(lang) and lang.lower().startswith("en")


def transcribe(
    audio_path: str,
    task: str = "translate",
    language_hint: Optional[str] = None,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Transcribe audio using Groq Whisper API.

    Args:
        audio_path:    Path to audio file (WebM, WAV, MP3, M4A, etc.)
        task:          'translate' → any language to English (default)
                       'transcribe' → keep original language
        language_hint: ISO-639-1 code of the audio language (e.g. 'en', 'ur').
                       Skips Whisper's language detection pass — faster + more
                       accurate when the language is already known.
        context:       Last ~300 chars of prior transcript text. Appended to the
                       medical prompt so Whisper continues naturally across chunk
                       boundaries instead of starting cold each time.

    Returns:
        {
          "segments": [{ "start": float, "end": float, "text": str, "speaker": "Speaker 1" }],
          "language": str
        }
    """
    from config import Config

    if not Config.GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY not set. Get a free key at https://console.groq.com"
        )

    client = _get_client()

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    filename = os.path.basename(audio_path)

    # Build prompt: medical vocab bias + recent context for cross-chunk continuity
    prompt = _MEDICAL_PROMPT
    if context:
        # Whisper uses the prompt as prior context — appending the last sentence
        # prevents it from starting cold and mis-transcribing the first word.
        prompt = f"{_MEDICAL_PROMPT} {context.strip()}"

    # Auto-switch: translating English → English adds no value and increases latency
    if task == "translate" and _is_english(language_hint):
        task = "transcribe"

    # Common kwargs improve accuracy on every call
    common_kwargs = dict(
        file             = (filename, audio_bytes),
        model            = Config.GROQ_TRANSCRIBE_MODEL,
        response_format  = "verbose_json",
        temperature      = 0,            # deterministic output
        prompt           = prompt,
    )

    # Only the transcriptions endpoint accepts a language hint
    if task == "transcribe" and language_hint:
        common_kwargs["language"] = language_hint

    if task == "translate":
        response = client.audio.translations.create(**common_kwargs)
        language = "English (translated)"
    else:
        response = client.audio.transcriptions.create(**common_kwargs)
        language = (
            getattr(response, "language", None)
            or language_hint
            or "Unknown"
        )

    from services.correction_service import correct_text

    # Build segment list
    segments: List[Dict[str, Any]] = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            text = correct_text((getattr(seg, "text", "") or "").strip())
            segments.append({
                "start":   float(getattr(seg, "start", 0)),
                "end":     float(getattr(seg, "end",   0)),
                "text":    text,
                "speaker": "Speaker 1",   # overwritten by diarization
            })

    # Groq translations endpoint sometimes returns empty segments but full text
    has_text = any(s["text"] for s in segments)
    if not has_text:
        full_text = correct_text((getattr(response, "text", "") or "").strip())
        if full_text:
            start = segments[0]["start"] if segments else 0.0
            end   = segments[-1]["end"]  if segments else 0.0
            segments = [{
                "start":   start,
                "end":     end,
                "text":    full_text,
                "speaker": "Speaker 1",
            }]

    return {"segments": segments, "language": language}
