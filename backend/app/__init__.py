from flask import Flask
from flask_cors import CORS

from app.config import Config, _cors_origins
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

    # Prefer live env (CORS_ORIGINS / FRONTEND_URL) over a stale import-time value.
    if getattr(config_object, "TESTING", False):
        cors_origins = app.config.get("CORS_ORIGINS", "*")
    else:
        cors_origins = _cors_origins()
        app.config["CORS_ORIGINS"] = cors_origins

    if cors_origins == "*" or cors_origins is None:
        CORS(app)
    else:
        CORS(
            app,
            resources={r"/api/*": {"origins": cors_origins}},
            supports_credentials=True,
        )

    # Import models so Flask-Migrate / metadata see them
    from app import models as _models  # noqa: F401

    from app.routes.auth_routes import auth_bp
    from app.routes.health_routes import health_bp
    from app.routes.product_routes import product_bp
    from app.routes.inventory_routes import inventory_bp
    from app.routes.cart_routes import cart_bp, booklist_bp
    from app.routes.notif_routes import notif_bp
    from app.routes.message_routes import message_bp
    from app.routes.admin_routes import admin_bp
    from app.routes.newsletter_routes import newsletter_bp
    from app.routes.uploads_routes import uploads_bp
    from app.routes.hero_routes import hero_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(product_bp, url_prefix="/api/products")
    app.register_blueprint(inventory_bp, url_prefix="/api/inventory")
    app.register_blueprint(cart_bp, url_prefix="/api/cart")
    app.register_blueprint(booklist_bp, url_prefix="/api/booklists")
    app.register_blueprint(notif_bp, url_prefix="/api/notifications")
    app.register_blueprint(message_bp, url_prefix="/api/messages")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(newsletter_bp, url_prefix="/api/newsletter")
    app.register_blueprint(uploads_bp, url_prefix="/api/uploads")
    app.register_blueprint(hero_bp, url_prefix="/api")

    @app.cli.command("purge-orders")
    def purge_orders_command():
        """Delete cancelled orders older than 30 days and completed older than 1 year."""
        from app.services.booklist_service import purge_expired_orders

        result = purge_expired_orders()
        print(
            f"Purged {result['purged']} order(s)"
            + (f": {result['order_ids']}" if result["order_ids"] else "")
        )

    return app
