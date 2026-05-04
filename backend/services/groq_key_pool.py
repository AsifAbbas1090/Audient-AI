"""
Groq API key pool: comma-separated GROQ_API_KEYS plus optional legacy GROQ_API_KEY.

- New live sessions receive the next key via round-robin (sticky per session).
- Callers pass session_id so requests prefer that session's key, then rotate on 429/quota.
"""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    pass

_lock = threading.Lock()
_round_robin_index = 0


def assign_key_index_for_new_session() -> int:
    """Round-robin pick key slot for a new session; persist index in audio_service session dict."""
    from config import Config

    keys = Config.GROQ_API_KEYS_LIST
    if not keys:
        return 0
    global _round_robin_index
    with _lock:
        idx = _round_robin_index % len(keys)
        _round_robin_index += 1
        return idx


def ordered_keys_for_request(session_id: Optional[str]) -> list[str]:
    """
    Keys to try in order: session-sticky primary first, then remaining keys.
    Stateless callers pass session_id=None → primary is keys[0].
    """
    from config import Config

    keys = Config.GROQ_API_KEYS_LIST
    if not keys:
        return []

    primary_slot = 0
    if session_id:
        from services import audio_service

        sess = audio_service.get_session(session_id)
        if sess is not None and isinstance(sess.get("groq_key_index"), int):
            primary_slot = int(sess["groq_key_index"]) % len(keys)

    # Try primary first, then full cycle so every distinct key is attempted once.
    return [keys[(primary_slot + i) % len(keys)] for i in range(len(keys))]
