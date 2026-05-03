"""
WebSocket event handlers — real-time audio transcription.

Events (client → server):
  join_session   { session_id }          — join the session room for targeted pushes
  audio_chunk    { session_id, audio }   — binary audio blob; server transcribes + emits back
  request_diarize{ session_id, segments} — re-label speakers on current segment list

Events (server → client):
  connected      { status }              — acknowledgement on connect
  transcript_update { segments, language } — new segments from Whisper
  diarize_update { segments }            — all segments with updated speaker labels
  session_error  { error }               — non-fatal error (transcription failed for this chunk)
"""
import os
import uuid
from flask import request
from flask_socketio import emit, join_room

from extensions import socketio
from config import Config
from services import audio_service, whisper_service


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_user_from_socket():
    """Decode JWT from Socket.IO auth metadata. Returns (user_id, user_role) or (None, None)."""
    try:
        # flask-socketio puts the 'auth' dict in request.environ
        auth = getattr(request, "environ", {}).get("HTTP_AUTHORIZATION", "")
        # socket.io-client sends auth: { token } which lands in request.args or handshake
        # flask-socketio exposes it via request.event or via the namespace
        token = None

        # Try the standard handshake auth object (most reliable path)
        # Available as request.environ['socketio']['auth'] in flask-socketio >= 5
        env_auth = request.environ.get("socketio", {})
        if isinstance(env_auth, dict):
            token = env_auth.get("auth", {}).get("token")

        # Fallback: Bearer header (used when socket connects with extra_headers)
        if not token and auth.startswith("Bearer "):
            token = auth[7:]

        if not token:
            return None, "healthcare"

        from utils.auth import decode_token
        payload = decode_token(token)
        return payload.get("user_id"), payload.get("role", "healthcare")
    except Exception:
        return None, "healthcare"


# ── Connection lifecycle ──────────────────────────────────────────────────────

@socketio.on("connect")
def handle_connect(auth=None):
    """
    Client connected.  auth is the dict passed as io({ auth: { token } }).
    We validate the JWT here and store user identity on the socket session.
    """
    # flask-socketio passes the auth payload as the first argument
    token = (auth or {}).get("token") if isinstance(auth, dict) else None

    user_id   = None
    user_role = "healthcare"
    if token:
        try:
            from utils.auth import decode_token
            payload   = decode_token(token)
            user_id   = payload.get("user_id")
            user_role = payload.get("role", "healthcare")
        except Exception:
            pass   # unauthenticated is fine — session still works

    # Store on the socket session so other handlers can read it
    from flask import session as flask_session  # noqa: F401 — socketio uses its own session
    # We use a module-level dict keyed by SID as flask-socketio's session is request-scoped
    _socket_meta[request.sid] = {"user_id": user_id, "role": user_role}

    print(f"[WS] connect sid={request.sid[:8]} user={user_id}")
    emit("connected", {"status": "ok", "sid": request.sid})


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    _socket_meta.pop(sid, None)
    print(f"[WS] disconnect sid={sid[:8]}")


# Module-level dict: { sid: { user_id, role } }
_socket_meta: dict = {}

# Rolling transcript context per session — stored as speaker-labeled lines so Whisper
# carries both text and speaker identity forward into the next chunk.
_session_context: dict = {}  # session_id → str (≤ whisper_service.WHISPER_ROLLING_CONTEXT_MAX)

# Cross-call diarization memory — confirmed example lines per speaker per session.
# Passed into diarize_with_groq to keep labels consistent across the 15s polling window.
_session_diarize_labels: dict = {}  # session_id → {"doctor": [str], "patient": [str]}


def _update_diarize_labels(session_id: str, labeled: list) -> None:
    """Accumulate a small bank of confirmed Doctor/Patient example lines per session."""
    if not session_id:
        return
    bank = _session_diarize_labels.setdefault(session_id, {"doctor": [], "patient": []})
    for seg in labeled:
        text = (seg.get("text") or "").strip()
        if len(text) < 12:
            continue
        role = (seg.get("speaker") or "").lower()
        if "doctor" in role:
            bank["doctor"].append(text)
        elif "patient" in role:
            bank["patient"].append(text)
    # Keep most recent 6 examples per role to bound memory
    bank["doctor"]  = bank["doctor"][-6:]
    bank["patient"] = bank["patient"][-6:]


# ── Session room ──────────────────────────────────────────────────────────────

@socketio.on("join_session")
def handle_join_session(data):
    """Join a named room so server can push updates to all listeners of a session."""
    session_id = (data or {}).get("session_id", "").strip()
    if not session_id:
        return
    join_room(session_id)
    print(f"[WS] sid={request.sid[:8]} joined room={session_id[:8]}")
    emit("joined", {"session_id": session_id})


# ── Audio chunk → transcription ───────────────────────────────────────────────

@socketio.on("audio_chunk")
def handle_audio_chunk(data):
    """
    Receive a binary audio blob from the client, transcribe it via Groq Whisper,
    and emit the segments back.

    data keys:
      session_id  str       — links to an existing session (optional)
      audio       bytes     — raw audio bytes (WebM / WAV / MP3)
      language    str       — previously detected language hint (optional)
      is_final    bool      — last chunk of a session (optional flag)
    """
    if not isinstance(data, dict):
        return

    audio_bytes    = data.get("audio")
    session_id     = (data.get("session_id")     or "").strip()
    lang_hint_raw  = (data.get("language")       or "").strip()
    lang_hint      = whisper_service.normalize_language(lang_hint_raw)
    is_final       = bool(data.get("is_final"))
    forced_speaker = (data.get("forced_speaker") or "").strip()  # dual-mic override

    if not audio_bytes or len(audio_bytes) < 500:
        return  # silence / empty chunk — skip

    # Save to a unique temp file
    tmp_path = os.path.join(Config.TEMP_DIR, f"ws_{uuid.uuid4()}.webm")
    try:
        with open(tmp_path, "wb") as f:
            f.write(bytes(audio_bytes) if not isinstance(audio_bytes, bytes) else audio_bytes)

        file_size = os.path.getsize(tmp_path)
        print(f"[WS/chunk] sid={request.sid[:8]} size={file_size}B final={is_final}")

        # ── Silence check ────────────────────────────────────────────────
        if audio_service.is_silent(tmp_path):
            return  # skip Groq call for silent chunks

        # ── Transcribe ───────────────────────────────────────────────────
        # Pass prior context as speaker-labeled lines so Whisper carries both
        # text continuity AND speaker identity forward into the next chunk.
        prior_context = _session_context.get(session_id, "") if session_id else ""

        # Use transcribe (not translate) when a specific language is already confirmed —
        # transcribing in the source language is more accurate; translation is done
        # separately by the extraction LLM which handles non-English well.
        task = "transcribe" if lang_hint else "translate"

        result   = whisper_service.transcribe(
            tmp_path,
            task=task,
            language_hint=lang_hint,
            context=prior_context or None,
        )
        segments = result.get("segments", [])
        language = result.get("language", "Unknown")

        if not segments:
            return

        # ── Update rolling context (speaker-labeled) for next chunk ──────
        # "[Doctor]: text [Patient]: text" format helps Whisper continue
        # with the right speaker register on the very first word of each chunk.
        if session_id:
            new_lines = " ".join(
                f"[{s.get('speaker') or 'Speaker'}]: {s.get('text', '').strip()}"
                for s in segments if s.get("text", "").strip()
            )
            combined = f"{prior_context} {new_lines}".strip()
            _session_context[session_id] = combined[
                -whisper_service.WHISPER_ROLLING_CONTEXT_MAX:
            ]

        # ── Dual-mic: override speaker label when forced_speaker is set ──
        # The patient mic sends chunks tagged with forced_speaker="Patient"
        # so we skip diarization and assign the label directly.
        if forced_speaker:
            for seg in segments:
                seg["speaker"] = forced_speaker

        # ── Audio accumulation for pyannote (if HF_TOKEN configured) ────
        # Runs in a daemon thread so FFmpeg conversion never blocks the WebSocket
        # event loop.  audio_service.append_chunk_to_session owns and deletes
        # the file, so we clear tmp_path to prevent the finally block from racing.
        if Config.HF_TOKEN and session_id and not forced_speaker and audio_service.session_exists(session_id):
            import threading
            chunk_for_thread = tmp_path
            tmp_path = None  # thread now owns the file
            threading.Thread(
                target=audio_service.append_chunk_to_session,
                args=(session_id, chunk_for_thread),
                daemon=True,
            ).start()

        # ── Push transcript back to this client ──────────────────────────
        emit("transcript_update", {
            "segments": segments,
            "language": language,
            "is_final": is_final,
        })

        # Free all session memory when recording ends
        if is_final and session_id:
            _session_context.pop(session_id, None)
            _session_diarize_labels.pop(session_id, None)

    except Exception as exc:
        print(f"[WS/chunk] error: {exc}")
        emit("session_error", {"error": str(exc)})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


# ── Diarization ───────────────────────────────────────────────────────────────

@socketio.on("request_diarize")
def handle_request_diarize(data):
    """
    Re-run speaker diarization on the full segment list accumulated so far.

    Priority:
      1. pyannote.audio on accumulated WAV (if HF_TOKEN set and audio exists)
      2. Groq LLM text-based diarization
      3. Return segments unchanged
    """
    if not isinstance(data, dict):
        return

    session_id = (data.get("session_id") or "").strip()
    segments   = data.get("segments") or []

    if not segments:
        return

    labeled = segments  # default: unchanged

    try:
        # ── Path 1: pyannote audio-based ─────────────────────────────────
        if Config.HF_TOKEN and session_id and audio_service.session_exists(session_id):
            session     = audio_service.get_session(session_id)
            wav_path    = session.get("wav_path", "")
            if wav_path and os.path.exists(wav_path) and os.path.getsize(wav_path) > 1000:
                try:
                    waveform, sr = audio_service.load_waveform_mono(wav_path)
                    duration     = audio_service.duration_seconds(waveform, sr)
                    if duration >= 1.0:
                        from services.diarize_service import diarize, assign_speakers
                        annotation = diarize(waveform, sr, min_speakers=2, max_speakers=3)
                        if annotation:
                            labeled, _ = assign_speakers(segments, annotation)
                            print(f"[WS/diarize] pyannote — {len(labeled)} segments, dur={duration:.1f}s")
                            emit("diarize_update", {"segments": labeled, "method": "pyannote"})
                            return
                except Exception as e:
                    print(f"[WS/diarize] pyannote failed: {e} — falling back to Groq LLM")

        # ── Path 2: Groq LLM text-based (70B with cross-call memory) ────
        if Config.GROQ_API_KEY and len(segments) >= 2:
            from services.diarize_service import diarize_with_groq, split_segments_by_sentence
            # Expand multi-sentence segments — LLM assigns per sentence, not per
            # Whisper chunk, so accuracy is much better on long segments.
            expanded    = split_segments_by_sentence(segments)
            prior_ctx   = _session_diarize_labels.get(session_id)
            labeled     = diarize_with_groq(expanded, prior_labels=prior_ctx)
            # Persist confirmed examples so the next diarize call stays consistent
            _update_diarize_labels(session_id, labeled)
            emit("diarize_update", {"segments": labeled, "method": "groq_llm"})

    except Exception as exc:
        print(f"[WS/diarize] error: {exc}")
        # Silent failure — diarization is cosmetic, don't break the session
