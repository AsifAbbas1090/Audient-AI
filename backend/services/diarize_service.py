"""
Diarization service — lazy-loaded pyannote pipeline.
Only initialised when HF_TOKEN is set. Returns None otherwise.
All speaker assignment logic lives here.
"""
from typing import List, Dict, Any, Optional

_pipeline = None


def get_pipeline():
    """Lazy-load pyannote pipeline. Returns None if HF_TOKEN not set."""
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    from config import Config
    if not Config.HF_TOKEN:
        return None

    from pyannote.audio import Pipeline
    print("[Diarize] Loading pyannote/speaker-diarization-3.1 ...")
    _pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=Config.HF_TOKEN,
    )
    print("[Diarize] Pipeline ready.")
    return _pipeline


def diarize(waveform, sample_rate: int, min_speakers: int = 1, max_speakers: int = 2):
    """
    Run diarization on a waveform tensor.
    Returns the raw pyannote Annotation object, or None if unavailable.
    """
    pipeline = get_pipeline()
    if pipeline is None:
        return None

    audio_input = {"waveform": waveform, "sample_rate": sample_rate}
    return pipeline(audio_input, min_speakers=min_speakers, max_speakers=max_speakers)


def assign_speakers(
    segments: List[Dict[str, Any]],
    diarization,
    speaker_map: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Assign speaker labels to transcript segments by timestamp intersection.
    Normalises raw pyannote speaker IDs (SPEAKER_00, SPEAKER_01) to
    human-readable labels (Speaker 1, Speaker 2).

    speaker_map: optional pre-built map to keep labels consistent across calls.
    Returns enriched segments and the (updated) speaker_map.
    """
    if speaker_map is None:
        speaker_map = {}

    # Build timeline from diarization annotation
    timeline = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        timeline.append({"start": turn.start, "end": turn.end, "speaker": speaker})

    result = []
    for seg in segments:
        mid = (seg.get("start", 0) + seg.get("end", 0)) / 2
        raw_speaker = "SPEAKER_00"
        for t in timeline:
            if t["start"] <= mid <= t["end"]:
                raw_speaker = t["speaker"]
                break

        if raw_speaker not in speaker_map:
            speaker_map[raw_speaker] = f"Speaker {len(speaker_map) + 1}"

        result.append({**seg, "speaker": speaker_map[raw_speaker]})

    return result, speaker_map
