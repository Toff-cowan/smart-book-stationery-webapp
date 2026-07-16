from flask import Flask
from flask_cors import CORS

from app.config import Config
from app.extensions.db import db
from app.extensions.jwt import jwt
from app.extensions.migrate import migrate


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        raise RuntimeError(
            "DATABASE_URL is not set. Copy backend/.env.example to backend/.env "
            "and add your Supabase Postgres connection string."
        )

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    CORS(app)

    # Import models so Flask-Migrate / metadata see them
    from app import models as _models  # noqa: F401

    from app.routes.auth_routes import auth_bp
    from app.routes.health_routes import health_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    return app
