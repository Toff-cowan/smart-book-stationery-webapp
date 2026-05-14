from flask import Flask
from flask_cors import CORS
from app.config import Config
from app.extensions.db import db
from app.extensions.jwt import jwt
from app.extensions.migrate import migrate


def create_app():
    app = Flask(__name__)

    app.config.from_object(Config)

    # Extensions
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    # CORS
    CORS(app)

    # Blueprints
    from app.routes.auth_routes import auth_bp

    app.register_blueprint(
        auth_bp,
        url_prefix="/api/auth"
    )

    return app