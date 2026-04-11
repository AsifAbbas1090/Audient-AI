"""
Audient AI — Backend Entry Point
Flask application factory. Run with: python app.py
"""
import os
from dotenv import load_dotenv

# Load .env before anything else so all os.getenv() calls in config.py work
load_dotenv()

# Set HF_HOME before any Hugging Face / torch imports
from config import Config
os.environ["HF_HOME"] = Config.HF_HOME

import shutil
from flask import Flask
from extensions import db, cors
from routes import register_blueprints


def create_app() -> Flask:
    app = Flask(__name__)

    # ------------------------------------------------------------------ #
    # Configuration                                                        #
    # ------------------------------------------------------------------ #
    app.config.from_object(Config)

    # ------------------------------------------------------------------ #
    # Extensions                                                           #
    # ------------------------------------------------------------------ #
    db.init_app(app)
    cors.init_app(app, resources={r"/*": {"origins": "*"}})

    # ------------------------------------------------------------------ #
    # Temp directories                                                     #
    # ------------------------------------------------------------------ #
    os.makedirs(Config.TEMP_DIR, exist_ok=True)
    os.makedirs(Config.SESSIONS_DIR, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Database tables                                                      #
    # ------------------------------------------------------------------ #
    with app.app_context():
        if Config.DATABASE_URL:
            try:
                db.create_all()
                print("[DB] Tables verified / created.")
            except Exception as e:
                print(f"[DB] Warning: could not create tables: {e}")
        else:
            print("[DB] DATABASE_URL not set — skipping table creation.")

    # ------------------------------------------------------------------ #
    # Routes                                                               #
    # ------------------------------------------------------------------ #
    register_blueprints(app)

    # ------------------------------------------------------------------ #
    # Startup diagnostics                                                  #
    # ------------------------------------------------------------------ #
    ffmpeg_found = shutil.which("ffmpeg") or Config.FFMPEG_PATH
    db_configured = bool(Config.DATABASE_URL)
    diarization_ready = bool(Config.HF_TOKEN)

    print(f"[Boot] Whisper model   : {Config.WHISPER_MODEL}")
    print(f"[Boot] FFmpeg          : {ffmpeg_found}")
    print(f"[Boot] HF_HOME         : {Config.HF_HOME}")
    print(f"[Boot] Diarization     : {'enabled (HF_TOKEN set)' if diarization_ready else 'disabled (no HF_TOKEN)'}")
    print(f"[Boot] Ollama model    : {Config.OLLAMA_EXTRACT_MODEL} @ {Config.OLLAMA_BASE_URL}")
    print(f"[Boot] Database        : {'configured' if db_configured else 'NOT configured — set DATABASE_URL in .env'}")

    return app


# Pre-load Whisper model at startup (avoid cold-start on first request)
def _preload_whisper():
    try:
        from services import whisper_service
        whisper_service._get_model()
    except Exception as e:
        print(f"[Boot] Whisper preload failed: {e}")


app = create_app()
_preload_whisper()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
