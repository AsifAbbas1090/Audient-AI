"""
Flask extension instances.
Instantiated here (without an app) so they can be imported
anywhere without creating circular imports.
Bound to the app in app.py via the factory pattern.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db      = SQLAlchemy()
cors    = CORS()
limiter = Limiter(
    key_func        = get_remote_address,
    default_limits  = [],          # no global default — apply per-route only
    storage_uri     = "memory://", # overridden to Redis in app.py when REDIS_URL is set
)
# async_mode='threading' — no monkey-patching required, works with all stdlib.
# For high concurrency (100+ simultaneous doctors) switch to eventlet:
#   pip install eventlet
#   change to async_mode='eventlet' and add eventlet.monkey_patch() at top of app.py
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode="threading",
    logger=False,
    engineio_logger=False,
)
