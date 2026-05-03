"""
Audient AI — Backend Entry Point
Flask application factory. Run with: python app.py
"""
import os
from dotenv import load_dotenv

# Load .env before anything else so all os.getenv() calls in config.py work
load_dotenv()

# ── SSL cert fix ───────────────────────────────────────────────────────────
_ssl_cert = os.environ.get("SSL_CERT_FILE", "")
if _ssl_cert and not os.path.isfile(_ssl_cert):
    try:
        import certifi
        os.environ["SSL_CERT_FILE"] = certifi.where()
        print(f"[SSL] SSL_CERT_FILE redirected to certifi: {certifi.where()}")
    except ImportError:
        del os.environ["SSL_CERT_FILE"]

# Set HF_HOME before any Hugging Face / torch imports
from config import Config, ensure_windows_media_dll_paths

os.environ["HF_HOME"] = Config.HF_HOME
# TorchCodec/torchaudio need FFmpeg DLL dirs visible before first native import (Windows).
ensure_windows_media_dll_paths()

import shutil
from flask import Flask, request
from extensions import db, cors, socketio, limiter
from routes import register_blueprints


def create_app() -> Flask:
    app = Flask(__name__)

    # ── Configuration ──────────────────────────────────────────────────────
    app.config.from_object(Config)

    # ── Extensions ─────────────────────────────────────────────────────────
    db.init_app(app)

    _allowed_origins = list(filter(None, {
        Config.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
    }))
    cors.init_app(app, resources={
        r"/api/*": {
            "origins":              _allowed_origins,
            "allow_headers":        ["Content-Type", "Authorization"],
            "methods":              ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "supports_credentials": True,
        }
    })

    # Belt-and-suspenders CORS headers (catches any routes flask-cors misses).
    # Reflects the request Origin when it matches an allowed frontend so that
    # Access-Control-Allow-Credentials: true is valid (wildcards are forbidden
    # when credentials=true per the CORS spec).
    @app.after_request
    def _add_cors_headers(response):
        origin  = request.headers.get("Origin", "")
        allowed = {Config.FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"}
        if origin in allowed:
            response.headers["Access-Control-Allow-Origin"]      = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    # NOTE: Do not register a catch-all `/api/<path>` OPTIONS route — it matches every
    # `/api/...` URL but only allows OPTIONS, so POST to real routes can incorrectly
    # return 405 if a more specific blueprint route is missing (e.g. old server code).
    # flask-cors above already handles OPTIONS for `/api/*`.

    # ── Rate Limiter ────────────────────────────────────────────────────────
    # Use Redis when available so limits persist across restarts and are
    # shared across multiple Flask workers.  Falls back to in-process memory.
    if Config.REDIS_URL:
        app.config["RATELIMIT_STORAGE_URI"] = Config.REDIS_URL
    limiter.init_app(app)

    # ── SocketIO ────────────────────────────────────────────────────────────
    socketio.init_app(app)

    # ── Celery (bind Flask app context to tasks) ────────────────────────────
    if Config.REDIS_URL:
        try:
            from celery_app import celery as celery_instance

            class ContextTask(celery_instance.Task):
                def __call__(self, *args, **kwargs):
                    with app.app_context():
                        return self.run(*args, **kwargs)

            celery_instance.Task = ContextTask
            print(f"[Boot] Celery          : OK Redis broker — {Config.REDIS_URL[:30]}")
        except Exception as e:
            print(f"[Boot] Celery          : -- could not init — {e}")
    else:
        print("[Boot] Celery          : -- REDIS_URL not set, background tasks use daemon threads")

    # ── Temp directories ────────────────────────────────────────────────────
    os.makedirs(Config.TEMP_DIR, exist_ok=True)
    os.makedirs(Config.SESSIONS_DIR, exist_ok=True)

    # ── Database tables ─────────────────────────────────────────────────────
    with app.app_context():
        if Config.DATABASE_URL:
            try:
                db.create_all()
                print("[DB] Tables verified / created.")
            except Exception as e:
                print(f"[DB] Warning: could not create tables: {e}")
        else:
            print("[DB] DATABASE_URL not set — skipping table creation.")

    # ── Routes + Socket handlers ────────────────────────────────────────────
    register_blueprints(app)

    with app.app_context():
        if Config.DATABASE_URL:
            try:
                from routes.conversations import reconcile_stale_processing_sessions

                n = reconcile_stale_processing_sessions()
                if n:
                    print(f"[Boot] Stale sessions : reconciled {n} row(s) → status=failed")
            except Exception as e:
                print(f"[Boot] Stale session reconcile at startup skipped: {e}")

    # ── Pre-load pyannote pipeline in background (if HF_TOKEN is set) ─────────
    # Avoids a 30-90s blocking download on the first live diarization request.
    if Config.HF_TOKEN:
        import threading
        from services import diarize_service
        threading.Thread(target=diarize_service.get_pipeline, daemon=True, name="pyannote-preload").start()

    # ── Periodic stale-session reconcile (abandoned live + stuck /complete pipeline) ──
    if Config.DATABASE_URL:

        def _stale_reconcile_loop():
            import time
            from routes.conversations import reconcile_stale_processing_sessions

            interval = Config.STALE_SESSION_RECONCILE_INTERVAL_SECONDS
            while True:
                time.sleep(interval)
                try:
                    with app.app_context():
                        reconcile_stale_processing_sessions()
                except Exception as e:
                    print(f"[stale-processing] periodic reconcile error: {e}")

        import threading

        threading.Thread(
            target=_stale_reconcile_loop,
            daemon=True,
            name="stale-session-reconcile",
        ).start()

    # ── Startup diagnostics ─────────────────────────────────────────────────
    groq_ready  = bool(Config.GROQ_API_KEY)
    diar_ready  = bool(Config.HF_TOKEN)
    db_ready    = bool(Config.DATABASE_URL)
    redis_ready = bool(Config.REDIS_URL)

    print(f"[Boot] Groq API        : {'OK configured' if groq_ready else '-- NOT set — add GROQ_API_KEY to .env'}")
    print(f"[Boot] Diarization     : {'OK pyannote pre-loading in background' if diar_ready else '~~ Groq LLM text-based (set HF_TOKEN for audio-based)'}")
    print(f"[Boot] Database        : {'OK configured' if db_ready else '-- NOT configured — set DATABASE_URL in .env'}")
    print(f"[Boot] WebSocket       : OK threading mode  ws://localhost:{Config.PORT}")

    return app


app = create_app()

if __name__ == "__main__":
    # Use socketio.run() instead of app.run() — this enables the WebSocket server
    socketio.run(
        app,
        host="0.0.0.0",
        port=Config.PORT,
        debug=Config.DEBUG,
        allow_unsafe_werkzeug=True,   # needed for threading mode in debug
    )
