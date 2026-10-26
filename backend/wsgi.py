"""Entry point:  python wsgi.py   (or:  flask --app wsgi run / gunicorn wsgi:app)"""
from app import create_app
from app.realtime import socketio

app = create_app()

if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", "5000"))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
