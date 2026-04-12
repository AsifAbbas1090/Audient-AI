"""
Audient AI — Backend Entry Point
Flask application factory. Run with: python app.py
"""
import os
from dotenv import load_dotenv

# Load .env before anything else so all os.getenv() calls in config.py work
load_dotenv()

# ── SSL cert fix ───────────────────────────────────────────────────────────
# SSL_CERT_FILE may be set by a system-wide Python install to a .pem file
# that no longer exists (e.g. a file someone once downloaded to ~/Downloads).
# httpx / Groq SDK reads this env var at client construction time and crashes
# with FileNotFoundError before any network call is made.
# Fix: if the path is missing, redirect to certifi's bundled CA store.
_ssl_cert = os.environ.get("SSL_CERT_FILE", "")
if _ssl_cert and not os.path.isfile(_ssl_cert):
    try:
        import certifi
        os.environ["SSL_CERT_FILE"] = certifi.where()
        print(f"[SSL] SSL_CERT_FILE was missing — redirected to certifi: {certifi.where()}")
    except ImportError:
        del os.environ["SSL_CERT_FILE"]
        print("[SSL] SSL_CERT_FILE was missing and certifi unavailable — env var removed.")

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
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": "*",
            "allow_headers": ["Content-Type", "Authorization"],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "supports_credentials": False,
        }
    })

    # Belt-and-suspenders: manually inject CORS headers so OPTIONS
    # preflight always returns 200 even if flask-cors misses it.
    @app.after_request
    def _add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"]  = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    @app.route("/api/<path:_>", methods=["OPTIONS"])
    def _options_handler(_):
        return "", 200

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

    groq_ready = bool(Config.GROQ_API_KEY)
    print(f"[Boot] Groq API        : {'✓ configured' if groq_ready else '✗ NOT set — add GROQ_API_KEY to .env'}")
    print(f"[Boot] Diarization     : {'✓ enabled (HF_TOKEN set)' if diarization_ready else '✗ disabled — offline only, set HF_TOKEN'}")
    print(f"[Boot] Ollama fallback : {Config.OLLAMA_EXTRACT_MODEL} @ {Config.OLLAMA_BASE_URL}")
    print(f"[Boot] Database        : {'✓ configured' if db_configured else '✗ NOT configured — set DATABASE_URL in .env'}")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
