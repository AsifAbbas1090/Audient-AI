"""
Health routes:
  GET /health          — basic liveness check
  GET /api/config      — alias
  GET /api/db-test     — Supabase connection test
"""
from flask import Blueprint, jsonify
from sqlalchemy import text
from extensions import db
from config import Config

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
@health_bp.route("/api/config", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "mode": "offline",
        "whisper_model": Config.WHISPER_MODEL,
        "extraction_available": True,
        "diarization_available": bool(Config.HF_TOKEN),
    })


@health_bp.route("/api/db-test", methods=["GET"])
def db_test():
    """
    Test Supabase PostgreSQL connection.
    Returns connection status and basic DB info.
    """
    if not Config.DATABASE_URL:
        return jsonify({
            "status": "not_configured",
            "message": "DATABASE_URL is not set in .env",
        }), 503

    try:
        result = db.session.execute(text("SELECT version()"))
        version = result.fetchone()[0]
        return jsonify({
            "status": "connected",
            "database": "supabase_postgresql",
            "version": version,
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
        }), 500
