"""
Centralized configuration for Audient AI backend.
All environment variables are read here — nowhere else in the codebase.
"""
import os
import shutil


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
    FFMPEG_PATH: str = os.getenv("FFMPEG_PATH", shutil.which("ffmpeg") or "ffmpeg")
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
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "").strip()
    GROQ_TRANSCRIBE_MODEL: str = "whisper-large-v3"
    GROQ_EXTRACT_MODEL: str = os.getenv("GROQ_EXTRACT_MODEL", "llama-3.1-8b-instant").strip()

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
    JWT_EXPIRY_DAYS: int = int(os.getenv("JWT_EXPIRY_DAYS", "7"))

    # ------------------------------------------------------------------ #
    # Server                                                               #
    # ------------------------------------------------------------------ #
    PORT: int = int(os.getenv("PORT", "5000"))
    DEBUG: bool = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production")
