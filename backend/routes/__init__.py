"""
Route registration.
Import and register all blueprints in one place.
"""
from .health import health_bp
from .sessions import sessions_bp
from .transcribe import transcribe_bp
from .extract import extract_bp


def register_blueprints(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(transcribe_bp)
    app.register_blueprint(extract_bp)
