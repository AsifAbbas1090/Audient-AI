"""
Route registration — imports and registers all blueprints.
"""
from .health         import health_bp
from .auth           import auth_bp
from .sessions       import sessions_bp
from .transcribe     import transcribe_bp
from .extract        import extract_bp
from .conversations  import conversations_bp
from .patients       import patients_bp
from .admin          import admin_bp


def register_blueprints(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(transcribe_bp)
    app.register_blueprint(extract_bp)
    app.register_blueprint(conversations_bp)
    app.register_blueprint(patients_bp)
    app.register_blueprint(admin_bp)
