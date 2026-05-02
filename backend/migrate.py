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
    # ── doctor templates (versioned layout + branding snapshots) ───────────
    """
    CREATE TABLE IF NOT EXISTS doctor_templates (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose VARCHAR(32) NOT NULL DEFAULT 'clinical',
      name VARCHAR(255) NOT NULL DEFAULT 'My Clinical Template',
      specialty_base VARCHAR(50) NOT NULL DEFAULT 'general_mbbs',
      schema_json JSON NOT NULL,
      active_version_id VARCHAR(36),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS doctor_template_versions (
      id VARCHAR(36) PRIMARY KEY,
      template_id VARCHAR(36) NOT NULL REFERENCES doctor_templates(id) ON DELETE CASCADE,
      version_number INT NOT NULL,
      schema_json JSON NOT NULL,
      branding_snapshot_json JSON NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_template_version_number UNIQUE (template_id, version_number)
    );
    """,
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
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS template_version_id VARCHAR(36)
      REFERENCES doctor_template_versions(id) ON DELETE SET NULL;
    """,
    """
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS patient_template_version_id VARCHAR(36)
      REFERENCES doctor_template_versions(id) ON DELETE SET NULL;
    """,
    # ── doctor_templates: purpose + one row per (user, purpose) ──────────────
    # Legacy installs had UNIQUE(user_id) only; replace with (user_id, purpose).
    """
    ALTER TABLE doctor_templates
      ADD COLUMN IF NOT EXISTS purpose VARCHAR(32);
    """,
    """
    UPDATE doctor_templates SET purpose = 'clinical' WHERE purpose IS NULL;
    """,
    """
    ALTER TABLE doctor_templates
      ALTER COLUMN purpose SET DEFAULT 'clinical';
    """,
    """
    ALTER TABLE doctor_templates
      ALTER COLUMN purpose SET NOT NULL;
    """,
    """
    ALTER TABLE doctor_templates
      DROP CONSTRAINT IF EXISTS doctor_templates_user_id_key;
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_templates_user_purpose
      ON doctor_templates (user_id, purpose);
    """,
    # ── summaries: patient-facing plain-language text ───────────────────────
    """
    ALTER TABLE summaries
      ADD COLUMN IF NOT EXISTS patient_facing_summary TEXT;
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
    # ── users (doctor profile + branding) ───────────────────────────────────
    """
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS specialty VARCHAR(50) NOT NULL DEFAULT 'general_mbbs';
    """,
    """
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS doctor_title VARCHAR(255);
    """,
    """
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS clinic_name VARCHAR(255);
    """,
    """
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS license_number VARCHAR(120);
    """,
    """
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS signature_url TEXT;
    """,
    """
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS logo_url TEXT;
    """,
    # ── session_access (Phase 2) ──────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS session_access (
      id            VARCHAR(36) PRIMARY KEY,
      session_id    VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      granted_by_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      grantee_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission    VARCHAR(10) NOT NULL DEFAULT 'read',
      expires_at    TIMESTAMPTZ,
      revoked_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_session_access_session ON session_access (session_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_session_access_grantee ON session_access (grantee_id);
    """,
    # ── session_comments (Phase 2) ────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS session_comments (
      id         VARCHAR(36) PRIMARY KEY,
      session_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      author_id  VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_session_comments_session ON session_comments (session_id);
    """,
    # ── consult_requests (Phase 3) ────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS consult_requests (
      id                VARCHAR(36) PRIMARY KEY,
      session_id        VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      patient_thread_id VARCHAR(36) REFERENCES patients(id) ON DELETE SET NULL,
      requester_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode              VARCHAR(20) NOT NULL,
      access_id         VARCHAR(36) REFERENCES session_access(id) ON DELETE SET NULL,
      status            VARCHAR(20) NOT NULL DEFAULT 'pending',
      briefing_json     JSON,
      requester_note    TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      responded_at      TIMESTAMPTZ,
      expires_at        TIMESTAMPTZ NOT NULL
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_consult_requests_reviewer ON consult_requests (reviewer_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_consult_requests_session ON consult_requests (session_id);
    """,
    # ── notifications (Phase 4) ───────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS notifications (
      id            VARCHAR(36) PRIMARY KEY,
      user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type          VARCHAR(50) NOT NULL,
      payload_json  JSON,
      read_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON notifications (user_id, created_at DESC);
    """,
    # ── consult_requests: reviewer response note ───────────────────────────────
    """
    ALTER TABLE consult_requests
      ADD COLUMN IF NOT EXISTS respond_note TEXT;
    """,
    # ── patients: add patient_code (PAT-XXXX) ─────────────────────────────────
    """
    ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS patient_code VARCHAR(12);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_patients_patient_code ON patients (patient_code);
    """,
    # ── audit_logs / patients — entire tables may be new ──────────────────
    # db.create_all() handles creation below.
    # ── summaries: doctor prescription fields ─────────────────────────────────
    """
    ALTER TABLE summaries
      ADD COLUMN IF NOT EXISTS prescription_medicines JSON;
    """,
    """
    ALTER TABLE summaries
      ADD COLUMN IF NOT EXISTS prescription_tests JSON;
    """,
    """
    ALTER TABLE summaries
      ADD COLUMN IF NOT EXISTS prescription_instructions TEXT;
    """,
    # ── vocal_command_logs — timestamped audit of every wake-word event ──────────
    """
    CREATE TABLE IF NOT EXISTS vocal_command_logs (
      id              VARCHAR(36) PRIMARY KEY,
      session_id      VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      phrase_heard    TEXT,
      confidence      FLOAT,
      command_matched VARCHAR(32),
      action_taken    BOOLEAN NOT NULL DEFAULT true,
      triggered_at    TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_vocal_command_logs_session ON vocal_command_logs (session_id);
    """,
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
