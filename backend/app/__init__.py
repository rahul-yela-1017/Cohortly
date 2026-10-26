"""Cohortly backend application factory."""
from __future__ import annotations

from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    if not app.config["SECRET_KEY"]:
        raise RuntimeError("SECRET_KEY environment variable is required.")

    CORS(app, origins=app.config["CORS_ORIGINS"])

    from .db import init_db

    init_db(app)

    from .auth_bp import bp as auth_bp
    from .users_bp import bp as users_bp
    from .chat_bp import bp as chat_bp
    from .files_bp import bp as files_bp
    from .teams_bp import bp as teams_bp
    from .community_bp import bp as community_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(teams_bp)
    app.register_blueprint(community_bp)

    from .limits import limiter

    limiter.init_app(app)

    from .realtime import init_socket_handlers, socketio

    init_socket_handlers(app)
    socketio.init_app(app, cors_allowed_origins=app.config["CORS_ORIGINS"], async_mode="threading")
    app.extensions["socketio"] = socketio

    @app.get("/api/health")
    def health():
        # Public endpoint: status only. Class identity is revealed to
        # authenticated users via the login/register responses, never pre-login.
        return jsonify({"status": "ok"})

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found."}), 404

    @app.errorhandler(429)
    def rate_limited(_):
        return jsonify({"error": "Too many requests. Slow down and try again shortly."}), 429

    @app.errorhandler(500)
    def server_error(_):
        return jsonify({"error": "Something went wrong on our side."}), 500

    return app
