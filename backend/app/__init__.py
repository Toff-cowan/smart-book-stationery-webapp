from flask import Flask
from flask_cors import CORS

from app.config import Config

# Extensions
from app.extensions.db import db
from app.extensions.jwt import jwt
from app.extensions.migrate import migrate


def create_app():
    app = Flask(__name__)

    # Load Config
    app.config.from_object(Config)

    # Initialize Extensions
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    # Enable CORS
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True
    )

    # =========================
    # Register Blueprints
    # =========================
    from app.routes.auth_routes import auth_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    @app.route("/")
    def home():
        return {
            "success": True,
            "message": "Smart Book & Stationery API Running"
        }

    return app