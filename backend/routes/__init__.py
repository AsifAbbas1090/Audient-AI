"""
Route registration — imports and registers all blueprints.
Socket.IO handlers are imported here so their @socketio.on decorators
fire against the socketio instance in extensions.py.
"""
from .health         import health_bp
from .auth           import auth_bp
from .sessions       import sessions_bp
from .transcribe     import transcribe_bp
from .extract        import extract_bp
from .conversations  import conversations_bp
from .patients       import patients_bp
from .admin          import admin_bp
from .users          import users_bp
from .templates      import templates_bp
from .access         import access_bp
from .consults       import consults_bp
from .notifications  import notifications_bp

# Import socket handlers to register @socketio.on decorators
from . import socket_handlers  # noqa: F401


def register_blueprints(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(transcribe_bp)
    app.register_blueprint(extract_bp)
    app.register_blueprint(conversations_bp)
    app.register_blueprint(patients_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(templates_bp)
    app.register_blueprint(access_bp)
    app.register_blueprint(consults_bp)
    app.register_blueprint(notifications_bp)
