"""
Transcription service — Groq or OpenAI Whisper API (online).

Set TRANSCRIBE_PROVIDER=groq (default) or openai in .env.
  - Groq: GROQ_API_KEY + GROQ_TRANSCRIBE_MODEL
  - OpenAI: OPENAI_API_KEY + OPENAI_TRANSCRIBE_MODEL (default whisper-1)
"""
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional

# Groq Whisper API hard cap (invalid_request_error if exceeded).
GROQ_WHISPER_PROMPT_CHAR_LIMIT = 896
# Target max before optional word-boundary trim; stay under API limit.
WHISPER_PROMPT_MAX = 880
WHISPER_ROLLING_CONTEXT_MAX = 800  # tail of transcript kept per session / caller


def truncate_prompt_for_api(
    prompt: str | None,
    *,
    hard_limit: int,
    soft_target: int,
) -> str | None:
    if not prompt:
        return None
    text = unicodedata.normalize("NFC", prompt.strip())
    if not text:
        return None
    target = min(soft_target, hard_limit)
    if len(text) <= target:
        return text
    tail = text[-target:]
    space_idx = tail.find(" ")
    if 0 < space_idx < 50:
        tail = tail[space_idx + 1 :]
    if len(tail) > hard_limit:
        tail = tail[-hard_limit:]
    return tail


def _clamp_prompt_final(text: str, hard_limit: int) -> str:
    if len(text) <= hard_limit:
        return text
    return text[-hard_limit:]


_groq_client = None
_openai_stt_client = None


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        from config import Config
        from groq import Groq
        _groq_client = Groq(api_key=Config.GROQ_API_KEY)
    return _groq_client


def _get_openai_stt_client():
    global _openai_stt_client
    if _openai_stt_client is None:
        from config import Config
        from openai import OpenAI
        _openai_stt_client = OpenAI(api_key=Config.OPENAI_API_KEY)
    return _openai_stt_client


# Medical consultation context fed to Whisper as an initial_prompt.
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

_LANGUAGE_NAME_TO_CODE = {
    "arabic": "ar",
    "chinese": "zh",
    "dutch": "nl",
    "english": "en",
    "french": "fr",
    "german": "de",
    "hindi": "hi",
    "indonesian": "id",
    "italian": "it",
    "japanese": "ja",
    "korean": "ko",
    "malay": "ms",
    "polish": "pl",
    "portuguese": "pt",
    "russian": "ru",
    "spanish": "es",
    "thai": "th",
    "turkish": "tr",
    "urdu": "ur",
    "vietnamese": "vi",
}


def normalize_language(value: str) -> str | None:
    """Map UI labels to ISO codes for Whisper, or None to omit `language` (auto-detect)."""
    if not value:
        return None
    raw = unicodedata.normalize("NFKC", value.strip())
    if not raw:
        return None
    full_lower = raw.lower()
    # Drop parenthetical UI text: "English (translated)" — still guard "translat" below.
    simplified = re.sub(r"\([^)]*\)", "", raw).strip()
    lowered = simplified.lower()
    if (
        lowered in {"auto", "any", "any language"}
        or full_lower in {"auto", "any", "any language"}
    ):
        return None
    if "translat" in full_lower:
        return None
    if "→" in raw or "->" in full_lower:
        return None
    if lowered in _LANGUAGE_NAME_TO_CODE:
        return _LANGUAGE_NAME_TO_CODE[lowered]
    if 2 <= len(lowered) <= 3 and lowered.isalpha():
        return lowered
    return None


def _language_code_for_api(lang: Optional[str]) -> Optional[str]:
    """Only pass through short alphabetic codes; never UI strings like 'English (translated)'."""
    if not lang:
        return None
    s = lang.strip().lower()
    if 2 <= len(s) <= 3 and s.isalpha():
        return s
    return None


def _groq_translation_kwargs(common_kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Groq translations must never receive `language` (invalid values → 400)."""
    return {k: v for k, v in common_kwargs.items() if k != "language"}


def _is_english(lang: Optional[str]) -> bool:
    return bool(lang) and lang.lower().startswith("en")


def _context_tail(context: Optional[str]) -> str:
    if not context:
        return ""
    ctx = context.strip()
    if not ctx:
        return ""
    if len(ctx) > WHISPER_ROLLING_CONTEXT_MAX:
        return ctx[-WHISPER_ROLLING_CONTEXT_MAX:]
    return ctx


def _build_raw_prompt(context: Optional[str]) -> str:
    tail = _context_tail(context)
    if not tail:
        return _MEDICAL_PROMPT
    return f"{_MEDICAL_PROMPT} {tail}"


def _prepare_prompt_for_groq(context: Optional[str]) -> Optional[str]:
    raw = _build_raw_prompt(context)
    p = truncate_prompt_for_api(
        raw,
        hard_limit=GROQ_WHISPER_PROMPT_CHAR_LIMIT,
        soft_target=WHISPER_PROMPT_MAX,
    )
    if p is None:
        return None
    return _clamp_prompt_final(p, GROQ_WHISPER_PROMPT_CHAR_LIMIT)


def _prepare_prompt_for_openai(context: Optional[str]) -> Optional[str]:
    # Match Groq caps so the clinical prefix + tail fit; OpenAI may allow more —
    # staying ≤896 avoids surprises and matches our shared medical block.
    raw = _build_raw_prompt(context)
    p = truncate_prompt_for_api(
        raw,
        hard_limit=GROQ_WHISPER_PROMPT_CHAR_LIMIT,
        soft_target=WHISPER_PROMPT_MAX,
    )
    if p is None:
        return None
    return _clamp_prompt_final(p, GROQ_WHISPER_PROMPT_CHAR_LIMIT)


def _segments_from_openai_verbose(
    response: Any,
    correct_text_fn,
) -> tuple[List[Dict[str, Any]], str]:
    segments: List[Dict[str, Any]] = []
    raw_lang = getattr(response, "language", None)
    language = raw_lang if isinstance(raw_lang, str) and raw_lang.strip() else "Unknown"
    segs = getattr(response, "segments", None) or []
    for seg in segs:
        text = correct_text_fn((getattr(seg, "text", "") or "").strip())
        segments.append({
            "start":   float(getattr(seg, "start", 0)),
            "end":     float(getattr(seg, "end", 0)),
            "text":    text,
            "speaker": "Speaker 1",
        })
    has_text = any(s["text"] for s in segments)
    if not has_text:
        full_text = correct_text_fn((getattr(response, "text", "") or "").strip())
        if full_text:
            start = segments[0]["start"] if segments else 0.0
            end = segments[-1]["end"] if segments else 0.0
            segments = [{
                "start": start, "end": end, "text": full_text, "speaker": "Speaker 1",
            }]
    return segments, language


def _transcribe_groq(
    audio_path: str,
    task: str,
    language_hint: Optional[str],
    context: Optional[str],
) -> Dict[str, Any]:
    from config import Config
    from services.correction_service import correct_text

    client = _get_groq_client()
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    filename = os.path.basename(audio_path)

    prompt_for_api = _prepare_prompt_for_groq(context)
    normalized_language = normalize_language(language_hint or "")
    lang_for_api = _language_code_for_api(normalized_language)

    if task == "translate" and _is_english(normalized_language):
        task = "transcribe"

    common_kwargs = dict(
        file=(filename, audio_bytes),
        model=Config.GROQ_TRANSCRIBE_MODEL,
        response_format="verbose_json",
        temperature=0,
    )
    if prompt_for_api:
        common_kwargs["prompt"] = prompt_for_api
    if task == "transcribe" and lang_for_api:
        common_kwargs["language"] = lang_for_api

    if task == "translate":
        # Never pass `language` here — clients sometimes echo old labels back into transcribe calls.
        response = client.audio.translations.create(**_groq_translation_kwargs(common_kwargs))
        language = "English"
    else:
        response = client.audio.transcriptions.create(**common_kwargs)
        language = (
            getattr(response, "language", None)
            or normalized_language
            or "Unknown"
        )

    segments: List[Dict[str, Any]] = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            text = correct_text((getattr(seg, "text", "") or "").strip())
            segments.append({
                "start":   float(getattr(seg, "start", 0)),
                "end":     float(getattr(seg, "end", 0)),
                "text":    text,
                "speaker": "Speaker 1",
            })

    has_text = any(s["text"] for s in segments)
    if not has_text:
        full_text = correct_text((getattr(response, "text", "") or "").strip())
        if full_text:
            start = segments[0]["start"] if segments else 0.0
            end = segments[-1]["end"] if segments else 0.0
            segments = [{
                "start": start,
                "end": end,
                "text": full_text,
                "speaker": "Speaker 1",
            }]

    return {"segments": segments, "language": language}


def _transcribe_openai(
    audio_path: str,
    task: str,
    language_hint: Optional[str],
    context: Optional[str],
) -> Dict[str, Any]:
    from config import Config
    from services.correction_service import correct_text

    client = _get_openai_stt_client()
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    filename = os.path.basename(audio_path)
    file_tuple = (filename, audio_bytes)

    prompt_for_api = _prepare_prompt_for_openai(context)
    normalized_language = normalize_language(language_hint or "")
    lang_for_api = _language_code_for_api(normalized_language)

    if task == "translate" and _is_english(normalized_language):
        task = "transcribe"

    model = Config.OPENAI_TRANSCRIBE_MODEL

    if task == "translate":
        kwargs: Dict[str, Any] = dict(model=model, file=file_tuple)
        if prompt_for_api:
            kwargs["prompt"] = prompt_for_api
        response = client.audio.translations.create(**{k: v for k, v in kwargs.items() if k != "language"})
        language = "English"
        full_text = correct_text((getattr(response, "text", "") or "").strip())
        segments: List[Dict[str, Any]] = []
        if full_text:
            segments = [{
                "start": 0.0, "end": 0.0, "text": full_text, "speaker": "Speaker 1",
            }]
        return {"segments": segments, "language": language}

    kwargs = dict(model=model, file=file_tuple, response_format="verbose_json")
    if prompt_for_api:
        kwargs["prompt"] = prompt_for_api
    if lang_for_api:
        kwargs["language"] = lang_for_api
    response = client.audio.transcriptions.create(**kwargs)
    segments, lang = _segments_from_openai_verbose(response, correct_text)
    language = lang or normalized_language or "Unknown"
    return {"segments": segments, "language": language}


def transcribe(
    audio_path: str,
    task: str = "translate",
    language_hint: Optional[str] = None,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Transcribe audio using the configured cloud Whisper provider (Groq or OpenAI).

    Returns:
        { "segments": [...], "language": str }
    """
    from config import Config

    language_hint = normalize_language((language_hint or "").strip())
    provider = (Config.TRANSCRIBE_PROVIDER or "groq").strip().lower()

    if provider == "openai":
        if not Config.OPENAI_API_KEY:
            raise RuntimeError(
                "OPENAI_API_KEY not set. Add it to .env or set TRANSCRIBE_PROVIDER=groq"
            )
        return _transcribe_openai(audio_path, task, language_hint, context)

    if not Config.GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY not set. Get a free key at https://console.groq.com "
            "or set TRANSCRIBE_PROVIDER=openai with OPENAI_API_KEY"
        )
    return _transcribe_groq(audio_path, task, language_hint, context)
