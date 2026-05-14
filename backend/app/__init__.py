from flask import Flask
from .config import Config

from .extensions.db import db
from .extensions.jwt import jwt
from .extensions.migrate import migrate
from flask_cors import CORS

def create_app():
    app = Flask(__name__)

    app.config.from_object(Config)

    # Initialize Extensions
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    CORS(app)

    # Register Routes
    from .routes.auth_routes import auth_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    return app