"""
Standalone Supabase connection test.
Run from backend/: python test_db.py

Tests:
  1. DATABASE_URL is set
  2. DNS resolves for the host
  3. TCP connection opens on the port
  4. SQLAlchemy connects and runs SELECT version()
  5. All ORM tables exist (or creates them)
"""
import os
import sys
import socket
from urllib.parse import urlparse

from dotenv import load_dotenv
load_dotenv()

os.environ["HF_HOME"] = os.path.join(os.path.expanduser("~"), ".cache", "huggingface")

DB_URL = os.getenv("DATABASE_URL", "")

print("=" * 60)
print("  Audient AI — Supabase Connection Test")
print("=" * 60)

# ── 1. URL configured? ────────────────────────────────────────
if not DB_URL:
    print("\n[FAIL] DATABASE_URL is not set in .env")
    print("  → Copy .env.example to .env and fill in DATABASE_URL")
    sys.exit(1)

parsed = urlparse(DB_URL)
host = parsed.hostname
port = parsed.port or 5432
print(f"\n[1] URL           : configured")
print(f"    Host          : {host}")
print(f"    Port          : {port}")
print(f"    Database      : {parsed.path.lstrip('/')}")

# ── 2. DNS resolution ────────────────────────────────────────
print(f"\n[2] DNS resolve   : {host} ...", end=" ", flush=True)
try:
    ip = socket.gethostbyname(host)
    print(f"OK  ({ip})")
except socket.gaierror as e:
    print(f"FAILED\n    Error: {e}")
    print("\n  → Your Supabase project may be paused.")
    print("  → Go to supabase.com/dashboard → Resume project")
    print("  → Or check that DATABASE_URL is copied correctly.")
    sys.exit(1)

# ── 3. TCP connection ────────────────────────────────────────
print(f"[3] TCP connect   : {host}:{port} ...", end=" ", flush=True)
try:
    sock = socket.create_connection((host, port), timeout=10)
    sock.close()
    print("OK")
except Exception as e:
    print(f"FAILED\n    Error: {e}")
    print("\n  → Check firewall or try the Supabase pooler URL (port 6543).")
    sys.exit(1)

# ── 4. SQLAlchemy connection ─────────────────────────────────
print(f"[4] SQLAlchemy    : connecting ...", end=" ", flush=True)
try:
    from sqlalchemy import create_engine, text

    engine = create_engine(
        DB_URL,
        pool_pre_ping=True,
        connect_args={"sslmode": "require"},
    )
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version()")).fetchone()[0]
    print(f"OK")
    print(f"    PostgreSQL    : {version[:70]}")
except Exception as e:
    print(f"FAILED\n    Error: {e}")
    sys.exit(1)

# ── 5. Create ORM tables ─────────────────────────────────────
print(f"[5] ORM tables    : creating if not exist ...", end=" ", flush=True)
try:
    from config import Config
    Config.DATABASE_URL = DB_URL
    Config.SQLALCHEMY_DATABASE_URI = DB_URL

    from flask import Flask
    from extensions import db
    import models  # registers all models with SQLAlchemy

    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = DB_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "connect_args": {"sslmode": "require"},
    }

    db.init_app(app)
    with app.app_context():
        db.create_all()
    print("OK")
    print("    Tables        : conversations, audio_files, transcripts,")
    print("                    transcript_lines, summaries, field_reminders")
except Exception as e:
    print(f"FAILED\n    Error: {e}")
    sys.exit(1)

# ── Done ─────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  ALL TESTS PASSED — Supabase is connected and ready.")
print("=" * 60)
print("\nNext step: python app.py")
