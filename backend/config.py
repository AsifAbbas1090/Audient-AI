"""
Centralized configuration for Audient AI backend.
All environment variables are read here — nowhere else in the codebase.
"""
import os
import shutil


def _merge_groq_api_keys() -> list[str]:
    """Comma-separated GROQ_API_KEYS plus legacy GROQ_API_KEY (deduped, legacy first if new)."""
    raw = os.getenv("GROQ_API_KEYS", "").strip()
    keys: list[str] = []
    for part in raw.split(","):
        k = part.strip()
        if k and k not in keys:
            keys.append(k)
    legacy = os.getenv("GROQ_API_KEY", "").strip()
    if legacy and legacy not in keys:
        keys.insert(0, legacy)
    elif not keys and legacy:
        keys = [legacy]
    return keys


_GROQ_KEYS_MERGED = _merge_groq_api_keys()


class Config:
    # ------------------------------------------------------------------ #
    # Database (Supabase PostgreSQL)                                       #
    # ------------------------------------------------------------------ #
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Supabase requires SSL. connect_args only applied for PostgreSQL URLs.
    _db_url = os.getenv("DATABASE_URL", "")
    _is_postgres = _db_url.startswith("postgresql") or _db_url.startswith("postgres")
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,       # detect stale connections before use
        "pool_recycle": 300,         # recycle connections every 5 min
        "pool_size": 5,
        "max_overflow": 10,
        **({"connect_args": {"sslmode": "require"}} if _is_postgres else {}),
    }

    # ------------------------------------------------------------------ #
    # Audio / FFmpeg                                                       #
    # ------------------------------------------------------------------ #
    # Path to ffmpeg executable (used by subprocess conversion).
    FFMPEG_PATH: str = os.getenv("FFMPEG_PATH", shutil.which("ffmpeg") or "ffmpeg")
    # Windows: folder containing FFmpeg DLLs (usually the same dir as ffmpeg.exe).
    # TorchCodec/torchaudio need this on PATH + os.add_dll_directory — see ensure_windows_media_dll_paths().
    FFMPEG_BIN: str = os.getenv("FFMPEG_BIN", "").strip()
    TEMP_DIR: str = os.getenv("TEMP_DIR", "temp")
    SESSIONS_DIR: str = os.path.join(os.getenv("TEMP_DIR", "temp"), "sessions")

    # ------------------------------------------------------------------ #
    # Whisper (Speech-to-Text)                                            #
    # ------------------------------------------------------------------ #
    # Set HF_HOME in .env to point models to a specific drive/folder.
    # Defaults to ~/.cache/huggingface on all platforms.
    HF_HOME: str = os.getenv(
        "HF_HOME",
        os.path.join(os.path.expanduser("~"), ".cache", "huggingface"),
    )
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base").strip() or "base"

    # ------------------------------------------------------------------ #
    # Groq API (transcription + extraction — online, free tier)           #
    # ------------------------------------------------------------------ #
    # GROQ_API_KEYS: comma-separated list; merged with GROQ_API_KEY if present.
    GROQ_API_KEYS_LIST: list[str] = list(_GROQ_KEYS_MERGED)
    GROQ_API_KEY: str = GROQ_API_KEYS_LIST[0] if GROQ_API_KEYS_LIST else os.getenv(
        "GROQ_API_KEY", ""
    ).strip()
    GROQ_TRANSCRIBE_MODEL: str = (
        os.getenv("GROQ_TRANSCRIBE_MODEL", "whisper-large-v3").strip() or "whisper-large-v3"
    )
    GROQ_EXTRACT_MODEL: str = (
        os.getenv("GROQ_EXTRACT_MODEL", "llama-3.1-8b-instant").strip()
        or "llama-3.1-8b-instant"
    )
    # Larger model for speaker diarization — reasoning-heavy task, accuracy matters more than speed.
    GROQ_DIARIZE_MODEL: str  = os.getenv("GROQ_DIARIZE_MODEL",  "llama-3.3-70b-versatile").strip()
    # Backoff for 429 / 5xx from Groq (multi-session bursts hit per-minute caps quickly).
    GROQ_RETRY_MAX_ATTEMPTS: int = max(1, int(os.getenv("GROQ_RETRY_MAX_ATTEMPTS", "6")))
    GROQ_RETRY_BASE_DELAY: float = float(os.getenv("GROQ_RETRY_BASE_DELAY", "1.25"))
    GROQ_RETRY_MAX_DELAY: float = float(os.getenv("GROQ_RETRY_MAX_DELAY", "45"))

    # Speech-to-text provider: "groq" (default) or "openai" (Whisper API — e.g. for demos)
    TRANSCRIBE_PROVIDER: str = (
        os.getenv("TRANSCRIBE_PROVIDER", "groq").strip().lower() or "groq"
    )
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_TRANSCRIBE_MODEL: str = (
        os.getenv("OPENAI_TRANSCRIBE_MODEL", "whisper-1").strip() or "whisper-1"
    )

    # ------------------------------------------------------------------ #
    # Speaker Diarization (Pyannote — offline, optional)                  #
    # ------------------------------------------------------------------ #
    HF_TOKEN: str = os.getenv("HF_TOKEN", os.getenv("HUGGINGFACE_TOKEN", "")).strip()

    # ------------------------------------------------------------------ #
    # Medical Extraction fallback (Ollama — fully offline)                #
    # ------------------------------------------------------------------ #
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1").strip()
    OLLAMA_EXTRACT_MODEL: str = (
        os.getenv("OLLAMA_EXTRACT_MODEL", "phi3:mini").strip() or "phi3:mini"
    )

    # ------------------------------------------------------------------ #
    # Authentication (JWT)                                                 #
    # ------------------------------------------------------------------ #
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "jwt-secret-change-in-production")
    JWT_EXPIRY_DAYS: int = int(os.getenv("JWT_EXPIRY_DAYS", "7"))   # legacy — kept for compat
    JWT_ACCESS_EXPIRY_MINUTES: int = int(os.getenv("JWT_ACCESS_EXPIRY_MINUTES", "15"))
    JWT_REFRESH_EXPIRY_DAYS: int   = int(os.getenv("JWT_REFRESH_EXPIRY_DAYS",  "30"))

    # ------------------------------------------------------------------ #
    # CORS                                                                  #
    # ------------------------------------------------------------------ #
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # ------------------------------------------------------------------ #
    # Task Queue (Celery + Redis)                                          #
    # Set REDIS_URL to enable background processing.                       #
    # Without it the /complete pipeline runs in a daemon thread instead.  #
    # Free Redis: https://upstash.com  or  docker run -d -p 6379:6379 redis
    # ------------------------------------------------------------------ #
    REDIS_URL: str = os.getenv("REDIS_URL", "").strip()

    # Post-save pipeline (/complete → Celery/thread): mark stuck sessions failed after N minutes.
    # Live recording keeps status=processing but leaves processing_started_at NULL until /complete runs.
    PROCESSING_STALE_MINUTES: int = int(os.getenv("PROCESSING_STALE_MINUTES", "20"))

    # Live sessions never followed by POST /complete (closed tab, crash): stay processing forever
    # unless we clear them. Mark failed after this many hours (minimum 24). Default 7 days.
    RECORDING_PROCESSING_MAX_AGE_HOURS: int = max(
        24,
        int(os.getenv("RECORDING_PROCESSING_MAX_AGE_HOURS", "168")),
    )

    # Background reconcile interval while the API process is running (seconds, minimum 60).
    STALE_SESSION_RECONCILE_INTERVAL_SECONDS: int = max(
        60,
        int(os.getenv("STALE_SESSION_RECONCILE_INTERVAL_SECONDS", "300")),
    )

    # Celery Beat (optional): reconcile stuck processing rows while workers run.
    CELERY_BEAT_RECONCILE_SECONDS: int = max(
        60,
        int(os.getenv("CELERY_BEAT_RECONCILE_SECONDS", "300")),
    )

    # ------------------------------------------------------------------ #
    # Email (Resend)                                                       #
    # Get a free key at https://resend.com — 3,000 emails/month free.     #
    # Set FROM_EMAIL to a verified sender address in your Resend account. #
    # ------------------------------------------------------------------ #
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "").strip()
    FROM_EMAIL: str     = os.getenv("FROM_EMAIL", "Audient AI <noreply@audient.ai>").strip()
    APP_URL: str        = os.getenv("APP_URL", "http://localhost:3000").strip()

    # ------------------------------------------------------------------ #
    # Server                                                               #
    # ------------------------------------------------------------------ #
    PORT: int = int(os.getenv("PORT", "5000"))
    DEBUG: bool = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production")


def ensure_windows_media_dll_paths() -> None:
    """
    On Windows, Python 3.8+ isolates DLL search paths. TorchCodec (used by torchaudio)
    and FFmpeg-linked binaries then fail with 'Could not find module ... or one of its
    dependencies'. Register FFmpeg's bin directory early and prepend PATH so subprocess
    ffmpeg and native loaders agree.
    """
    import sys

    if sys.platform != "win32":
        return

    dirs: list[str] = []
    if Config.FFMPEG_BIN:
        dirs.append(Config.FFMPEG_BIN)

    exe = (Config.FFMPEG_PATH or "").strip()
    if exe and exe.lower() != "ffmpeg":
        d = os.path.dirname(os.path.abspath(exe))
        if d:
            dirs.append(d)

    if not dirs:
        w = shutil.which("ffmpeg")
        if w:
            dirs.append(os.path.dirname(os.path.abspath(w)))

    seen: set[str] = set()
    ordered: list[str] = []
    for d in dirs:
        if not d or d in seen:
            continue
        seen.add(d)
        if os.path.isdir(d):
            ordered.append(d)

    for d in ordered:
        try:
            os.add_dll_directory(d)  # type: ignore[attr-defined]
        except (OSError, AttributeError):
            pass

    if ordered:
        prefix = os.pathsep.join(ordered)
        os.environ["PATH"] = prefix + os.pathsep + os.environ.get("PATH", "")
