"""
Diarization service.
Online  mode (default): Groq LLM infers Doctor/Patient from transcript context.
Offline mode (optional): set HF_TOKEN in .env + install pyannote.audio for
                          audio-based diarization (more accurate, works per-chunk).
"""
import json
import re
from typing import List, Dict, Any, Optional


def split_segments_by_sentence(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Split multi-sentence segments into one-sentence units with interpolated
    timestamps.  This gives the LLM diarizer more lines to reason about, which
    dramatically improves accuracy on single-mic recordings where Whisper often
    returns 1–3 large segments containing the whole conversation.
    """
    import re
    result = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        # Split on sentence-ending punctuation followed by whitespace
        sentences = re.split(r'(?<=[.?!])\s+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        if len(sentences) <= 1:
            result.append(seg)
        else:
            start = float(seg.get("start") or 0)
            end   = float(seg.get("end")   or 0)
            dur   = (end - start) / len(sentences)
            for i, sentence in enumerate(sentences):
                result.append({
                    **seg,
                    "text":  sentence,
                    "start": round(start + i * dur, 3),
                    "end":   round(start + (i + 1) * dur, 3),
                })
    return result


def diarize_with_groq(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Use Groq LLM to assign speaker labels from transcript context alone.

    Strategy: send the numbered segment texts to llama-3.1-8b-instant and ask it
    to label each line as "Doctor" or "Patient".  Map Doctor→Speaker 1,
    Patient→Speaker 2 so the labels match what the frontend already expects.

    Falls back silently to the original segments on any error.
    Requires at least 2 segments with real text to attempt labelling.
    """
    from config import Config

    if not Config.GROQ_API_KEY:
        return segments

    text_segs = [s for s in segments if (s.get("text") or "").strip()]
    if len(text_segs) < 2:
        return segments   # not enough context

    try:
        from groq import Groq

        numbered = "\n".join(
            f"{i + 1}. {s['text'].strip()}"
            for i, s in enumerate(text_segs)
        )

        prompt = (
            "You are analyzing a medical consultation transcript between a doctor and a patient.\n"
            "Label each numbered line as either \"Doctor\" or \"Patient\".\n\n"
            "Rules:\n"
            "- Doctors ask clinical questions, give diagnoses, prescribe medicines, explain conditions.\n"
            "- Patients describe symptoms, answer questions, share history, ask about treatment.\n"
            "- If you are unsure, look at conversational flow (doctor usually speaks first).\n\n"
            "Return ONLY a JSON array with one label per line, in order.\n"
            "Example for 4 lines: [\"Doctor\",\"Patient\",\"Doctor\",\"Patient\"]\n\n"
            f"Transcript:\n{numbered}"
        )

        client = Groq(api_key=Config.GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=Config.GROQ_EXTRACT_MODEL,   # llama-3.1-8b-instant
            messages=[{"role": "user", "content": prompt}],
            max_tokens=len(text_segs) * 12 + 32,  # ~12 tokens per label
            temperature=0,
        )
        content = (resp.choices[0].message.content or "").strip()

        # Extract JSON array even if the model wraps it in prose
        match = re.search(r'\[.*?\]', content, re.DOTALL)
        if not match:
            print(f"[Diarize/Groq] Could not parse label array from: {content[:120]}")
            return segments

        labels: List[str] = json.loads(match.group())

        # Map labels back to original segment list (skip empty ones)
        result = []
        label_idx = 0
        for seg in segments:
            if (seg.get("text") or "").strip():
                raw_label = labels[label_idx] if label_idx < len(labels) else "Doctor"
                speaker   = "Doctor" if "doctor" in raw_label.lower() else "Patient"
                result.append({**seg, "speaker": speaker})
                label_idx += 1
            else:
                result.append(seg)

        return result

    except Exception as e:
        print(f"[Diarize/Groq] Error: {e}")
        return segments   # return unchanged on any failure


def get_pipeline():
    """
    Returns pyannote pipeline if HF_TOKEN is set, else None.
    Requires: pip install pyannote.audio torch torchaudio
    """
    from config import Config
    if not Config.HF_TOKEN:
        return None

    global _pipeline
    if _pipeline is not None:
        return _pipeline

    try:
        from pyannote.audio import Pipeline
        print("[Diarize] Loading pyannote/speaker-diarization-3.1 ...")
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=Config.HF_TOKEN,
        )
        print("[Diarize] Pipeline ready.")
        return _pipeline
    except ImportError:
        print("[Diarize] pyannote.audio not installed — diarization unavailable.")
        return None


_pipeline = None


def diarize(waveform, sample_rate: int, min_speakers: int = 1, max_speakers: int = 2):
    """Run diarization. Returns pyannote Annotation or None."""
    pipeline = get_pipeline()
    if pipeline is None:
        return None
    audio_input = {"waveform": waveform, "sample_rate": sample_rate}
    return pipeline(audio_input, min_speakers=min_speakers, max_speakers=max_speakers)


def assign_speakers(
    segments: List[Dict[str, Any]],
    diarization,
    speaker_map: Optional[Dict[str, str]] = None,
) -> tuple:
    """Assign speaker labels to transcript segments by timestamp."""
    if speaker_map is None:
        speaker_map = {}

    timeline = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        timeline.append({"start": turn.start, "end": turn.end, "speaker": speaker})

    result = []
    for seg in segments:
        mid        = (seg.get("start", 0) + seg.get("end", 0)) / 2
        raw_speaker = "SPEAKER_00"
        for t in timeline:
            if t["start"] <= mid <= t["end"]:
                raw_speaker = t["speaker"]
                break
        if raw_speaker not in speaker_map:
            speaker_map[raw_speaker] = f"Speaker {len(speaker_map) + 1}"
        result.append({**seg, "speaker": speaker_map[raw_speaker]})

    return result, speaker_map
