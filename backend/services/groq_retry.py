"""
Groq API calls with exponential backoff for 429 / transient HTTP errors.
Used by transcription, extraction, diarization, and enrichment paths.

Multi-key: groq_call_with_key_rotation() uses the session's primary key first,
then other keys when the error looks like rate limit or quota exhaustion.
"""
from __future__ import annotations

import random
import time
from typing import TYPE_CHECKING, Callable, Optional, TypeVar

if TYPE_CHECKING:
    from groq import Groq

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


def _quota_or_rate_limit(exc: BaseException) -> bool:
    """True when switching to another API key may help (per-key limits)."""
    code = _http_status(exc)
    if code == 429:
        return True
    msg = str(exc).lower()
    needles = (
        "quota",
        "rate limit",
        "too many requests",
        "limit exceeded",
        "capacity",
        "billing",
        "insufficient",
    )
    return any(n in msg for n in needles)


def groq_call_with_retry(
    operation: Callable[[], T],
    *,
    max_attempts: int | None = None,
) -> T:
    """Run `operation`; retry with backoff when Groq signals overload / transient faults."""
    from config import Config

    max_attempts = (
        max(1, max_attempts)
        if max_attempts is not None
        else max(1, Config.GROQ_RETRY_MAX_ATTEMPTS)
    )
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


def groq_call_with_key_rotation(
    session_id: Optional[str],
    operation: "Callable[[Groq], T]",
) -> T:
    """
    Prefer the API key bound to session_id (assigned at session start).
    On rate limit / quota-style errors, retry with remaining keys before failing.
    """
    from groq import Groq

    from config import Config
    from services.groq_key_pool import ordered_keys_for_request

    keys_order = ordered_keys_for_request(session_id)
    if not keys_order:
        raise RuntimeError("No Groq API keys configured (GROQ_API_KEYS / GROQ_API_KEY)")

    # One attempt per key: rotate immediately on 429/TPD instead of backing off repeatedly on one key.
    per_key_attempts = 1
    last: BaseException | None = None

    for idx, api_key in enumerate(keys_order):
        client = Groq(api_key=api_key)
        try:
            return groq_call_with_retry(
                lambda c=client: operation(c),
                max_attempts=per_key_attempts,
            )
        except Exception as e:
            last = e
            if idx >= len(keys_order) - 1 or not _quota_or_rate_limit(e):
                break
            redacted = f"{api_key[:8]}…{api_key[-4:]}" if len(api_key) > 14 else "***"
            print(
                f"[Groq] key {redacted} rate/quota — trying next key "
                f"({idx + 2}/{len(keys_order)})"
            )
    assert last is not None
    err_txt = str(last).lower()
    if "tokens per day" in err_txt or "tpd" in err_txt:
        print(
            "[Groq] All configured keys failed this call (often TPD). "
            "TPD is enforced per Groq account/org; error text may repeat the same org id even "
            "when rotating keys. If keys are on different accounts, each may still be at its "
            "own daily limit — check console.groq.com for each key, wait for reset, reduce "
            "70B usage, or upgrade tier."
        )
    raise last
