"""
Flask extension instances.
Instantiated here (without an app) so they can be imported
anywhere without creating circular imports.
Bound to the app in app.py via the factory pattern.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

db = SQLAlchemy()
cors = CORS()
