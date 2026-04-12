"""
Diarization service.
Online mode: returns None (unavailable) — speaker labels default to "Speaker 1".
Offline mode: set HF_TOKEN in .env to enable pyannote/speaker-diarization-3.1.
"""
from typing import List, Dict, Any, Optional


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
