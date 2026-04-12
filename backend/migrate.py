"""
Audient AI — Database migration helper.

Adds columns that may be missing from an existing Supabase schema
(created before some model fields were added) and creates any tables
that don't exist yet.

Safe to run multiple times — uses IF NOT EXISTS / try-except throughout.

Usage:
    cd backend
    python migrate.py
"""
import os
from dotenv import load_dotenv

load_dotenv()

from config import Config

if not Config.DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env — nothing to migrate.")
    raise SystemExit(1)

from app import app
from extensions import db
from sqlalchemy import text

MIGRATIONS = [
    # ── conversations ──────────────────────────────────────────────────────
    # user_id FK — added after initial schema
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)
      REFERENCES users(id) ON DELETE CASCADE;
    """,
    # is_offline flag
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT true;
    """,
    # created_at — some older rows may have only `date`
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    """,
    # ── conversations (approved_at) ────────────────────────────────────────
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    """,
    # ── audio_files ────────────────────────────────────────────────────────
    # Entire table may not exist — db.create_all() handles that below,
    # but add the MIME/format column defensively in case table exists without it.
    """
    ALTER TABLE audio_files
      ADD COLUMN IF NOT EXISTS format VARCHAR(10);
    """,
    # ── transcripts ────────────────────────────────────────────────────────
    """
    ALTER TABLE transcripts
      ADD COLUMN IF NOT EXISTS language_detected VARCHAR(50);
    """,
    """
    ALTER TABLE transcripts
      ADD COLUMN IF NOT EXISTS confidence_score FLOAT;
    """,
    # ── conversations (soft delete) ────────────────────────────────────────
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    """,
    # ── conversations (patient FK) — patients table must exist first ───────
    # db.create_all() creates patients before adding the FK column.
    # This ALTER is a defensive guard for re-runs after initial creation.
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS patient_id VARCHAR(36)
      REFERENCES patients(id) ON DELETE SET NULL;
    """,
    # ── audit_logs / patients — entire tables may be new ──────────────────
    # db.create_all() handles creation below.
]


def run():
    with app.app_context():
        conn = db.engine.connect()

        # 1. Run ALTER TABLE migrations (ignore errors for tables that don't exist yet)
        for sql in MIGRATIONS:
            stmt = sql.strip()
            try:
                conn.execute(text(stmt))
                conn.commit()
                # Print first line of statement as label
                print(f"  OK: {stmt.splitlines()[0].strip()}")
            except Exception as e:
                conn.rollback()
                err = str(e).splitlines()[0]
                # "does not exist" means the table hasn't been created yet — db.create_all handles it
                if "does not exist" in err or "UndefinedTable" in err:
                    print(f"  SKIP (table not yet created): {stmt.splitlines()[0].strip()}")
                else:
                    print(f"  WARN: {stmt.splitlines()[0].strip()} — {err}")

        conn.close()

        # 2. Create any entirely missing tables (transcripts, transcript_lines,
        #    summaries, audio_files, users, conversations, …)
        print("\nCreating missing tables…")
        try:
            db.create_all()
            print("  OK: db.create_all() — all tables verified / created.")
        except Exception as e:
            print(f"  ERROR during create_all: {e}")

        print("\nMigration complete.")


if __name__ == "__main__":
    run()
