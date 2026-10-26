"""Flask-SocketIO realtime layer.

Clients authenticate the WebSocket handshake with their session token
(``io({ auth: { token } })``). Each user joins a private room so the server can
push chat delivery, read receipts, typing and invitation events. The server
only ever relays ciphertext — it never decrypts message content.
"""
from __future__ import annotations

from flask import request
from flask_socketio import SocketIO, disconnect, emit, join_room

from .db import get_db
from .utils import _session_user

socketio = SocketIO(cors_allowed_origins=None, async_mode="threading")

# sid -> student id, populated on authenticated connect; used by event handlers
# because socket events carry no HTTP headers.
_SID_USERS: dict[str, str] = {}


def room_for(user_id) -> str:
    return f"user:{user_id}"


def emit_to_user(user_id, event: str, payload: dict) -> None:
    socketio.emit(event, payload, room=room_for(user_id))


def emit_to_users(user_ids, event: str, payload: dict, skip=None) -> None:
    for uid in user_ids:
        if skip is not None and str(uid) == str(skip):
            continue
        socketio.emit(event, payload, room=room_for(uid))


def init_socket_handlers(app) -> None:
    @socketio.on("connect")
    def on_connect(auth=None, *args):
        try:
            token = None
            if isinstance(auth, dict):
                token = auth.get("token")
            if not token:
                token = request.args.get("token")
            user = _session_user(get_db(app), token) if token else None
            if not user or not user.get("registered"):
                app.logger.debug("socket connect rejected (token provided: %s)", bool(token))
                return False
            join_room(room_for(user["_id"]))
            _SID_USERS[request.sid] = str(user["_id"])
            emit("hello", {"user_id": str(user["_id"])})
            return True
        except Exception:  # pragma: no cover
            app.logger.exception("socket connect failed")
            return False

    @socketio.on("typing")
    def on_typing(data=None):
        from bson import ObjectId

        from .chat_bp import conversation_for_user

        uid = _SID_USERS.get(request.sid)
        user = get_db(app).students.find_one({"_id": ObjectId(uid)}) if uid else None
        if not user:
            return disconnect()
        conv = conversation_for_user(get_db(app), user, (data or {}).get("conversation_id"))
        if not conv:
            return
        payload = {"conversation_id": str(conv["_id"]), "user_id": str(user["_id"]), "name": user.get("name")}
        for uid in _conv_recipients(conv, user):
            emit_to_user(uid, "chat:typing", payload)

    @socketio.on("disconnect")
    def on_disconnect():
        _SID_USERS.pop(request.sid, None)


def _conv_recipients(conv, user) -> list:
    if conv.get("type") == "team":
        db = get_db()
        team = db.teams.find_one({"_id": conv["team_id"]})
        return [m for m in (team or {}).get("members", []) if str(m) != str(user["_id"])]
    return [p for p in conv.get("participants", []) if str(p) != str(user["_id"])]
