"""
Groq API calls with exponential backoff for 429 / transient HTTP errors.
Used by transcription, extraction, diarization, and enrichment paths.
"""
from __future__ import annotations

import random
import time
from typing import Callable, TypeVar

T = TypeVar("T")


def _http_status(exc: BaseException) -> int | None:
    for attr in ("status_code", "status"):
        v = getattr(exc, attr, None)
        if isinstance(v, int):
            return v
    resp = getattr(exc, "response", None)
    if resp is not None:
        v = getattr(resp, "status_code", None)
        if isinstance(v, int):
            return v
    return None


def _retryable(exc: BaseException) -> bool:
    code = _http_status(exc)
    if code is not None:
        if code == 429:
            return True
        if code == 408 or code >= 500:
            return True
    msg = str(exc).lower()
    needles = (
        "429",
        "rate limit",
        "too many requests",
        "timeout",
        "timed out",
        "connection reset",
        "connection aborted",
        "temporarily unavailable",
        "503",
        "502",
    )
    return any(n in msg for n in needles)


def groq_call_with_retry(operation: Callable[[], T]) -> T:
    """Run `operation`; retry with backoff when Groq signals overload / transient faults."""
    from config import Config

    max_attempts = max(1, Config.GROQ_RETRY_MAX_ATTEMPTS)
    base = Config.GROQ_RETRY_BASE_DELAY
    max_delay = Config.GROQ_RETRY_MAX_DELAY
    last: BaseException | None = None

    for attempt in range(max_attempts):
        try:
            return operation()
        except Exception as e:
            last = e
            if attempt >= max_attempts - 1 or not _retryable(e):
                raise
            delay = min(max_delay, base * (2**attempt) + random.uniform(0, 0.4))
            print(f"[Groq/retry] {attempt + 1}/{max_attempts} sleep {delay:.1f}s: {e}")
            time.sleep(delay)

    assert last is not None
    raise last
