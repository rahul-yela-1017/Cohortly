"""Private (1:1) and team conversations + E2EE message transport.

Messages are stored and relayed as OpenPGP ciphertext produced on the sender's
device. The server validates membership, stores ciphertext and never sees keys.
"""
from __future__ import annotations

from bson import ObjectId
from flask import Blueprint, request

from .db import get_db
from .realtime import emit_to_user, emit_to_users
from .utils import (
    ValidationError,
    body_json,
    current_user,
    json_error,
    json_ok,
    jstr,
    login_required,
    now,
    oid,
    parse_cursor,
    public_profile,
    ser,
)

bp = Blueprint("chat", __name__, url_prefix="/api")


def conversation_for_user(db, user, conv_id) -> dict | None:
    """Return the conversation only if this user may read/write it."""
    cid = oid(conv_id or "")
    if not cid:
        return None
    conv = db.conversations.find_one({"_id": cid})
    if not conv:
        return None
    if conv.get("type") == "team":
        team = db.teams.find_one({"_id": conv.get("team_id")})
        if not team or user["_id"] not in team.get("members", []):
            return None
        return conv
    if user["_id"] in conv.get("participants", []):
        return conv
    return None


def _conv_payload(db, conv, user) -> dict:
    payload = {
        "id": str(conv["_id"]),
        "type": conv.get("type"),
        "team_id": str(conv["team_id"]) if conv.get("team_id") else None,
        "created_at": ser(conv.get("created_at")),
    }
    if conv.get("type") == "team":
        team = db.teams.find_one({"_id": conv["team_id"]}) or {}
        payload["title"] = team.get("name", "Team")
        payload["avatar_color"] = team.get("avatar_color", "#14b8a6")
        payload["member_count"] = len(team.get("members", []))
    else:
        other_id = next((p for p in conv.get("participants", []) if p != user["_id"]), None)
        other = db.students.find_one({"_id": other_id}) if other_id else None
        if other:
            payload.update(
                {
                    "title": other.get("name"),
                    "avatar_color": other.get("avatar_color", "#6366f1"),
                    "other_user": public_profile(other, viewer_id=user["_id"]),
                }
            )
        else:
            payload.update({"title": "Classmate", "avatar_color": "#6366f1"})
    payload["unread"] = db.messages.count_documents(
        {"conversation_id": conv["_id"], "sender_id": {"$ne": user["_id"]}, "read_by": {"$ne": user["_id"]}}
    )
    last = db.messages.find({"conversation_id": conv["_id"]}).sort("_id", -1).limit(1)
    last = list(last)
    if last:
        m = last[0]
        payload["last_message"] = {
            "id": str(m["_id"]),
            "sender_id": str(m["sender_id"]),
            "kind": m.get("kind"),
            "ciphertext": m.get("ciphertext"),
            "created_at": ser(m.get("created_at")),
        }
    return payload


@bp.post("/conversations/dm")
@login_required
def open_dm():
    db = get_db()
    user = current_user()
    data = body_json()
    target_id = oid(data.get("user_id") or "")
    if not target_id or target_id == user["_id"]:
        return json_error("Choose a classmate to message.", 422)
    target = db.students.find_one({"_id": target_id, "registered": True, "class_id": user.get("class_id")})
    if not target:
        return json_error("Only classmates on your approved roster can be messaged.", 404)
    key = ":".join(sorted([str(user["_id"]), str(target_id)]))
    conv = db.conversations.find_one({"dm_key": key})
    if not conv:
        doc = {
            "type": "dm",
            "dm_key": key,
            "participants": [user["_id"], target_id],
            "team_id": None,
            "created_at": now(),
        }
        result = db.conversations.insert_one(doc)
        conv = db.conversations.find_one({"_id": result.inserted_id})
    return json_ok({"conversation": _conv_payload(db, conv, user)})


@bp.get("/conversations")
@login_required
def list_conversations():
    db = get_db()
    user = current_user()
    dms = list(db.conversations.find({"type": "dm", "participants": user["_id"]}).sort("_id", -1).limit(100))
    teams = list(db.teams.find({"members": user["_id"]}))
    team_ids = [t["_id"] for t in teams]
    team_convs = (
        list(db.conversations.find({"type": "team", "team_id": {"$in": team_ids}})) if team_ids else []
    )
    convs = dms + team_convs

    def sort_key(conv):
        last = db.messages.find_one({"conversation_id": conv["_id"]}, sort=[("_id", -1)])
        return last["_id"] if last else conv["_id"]

    convs.sort(key=sort_key, reverse=True)
    return json_ok({"conversations": [_conv_payload(db, c, user) for c in convs]})


@bp.get("/conversations/<conv_id>/messages")
@login_required
def list_messages(conv_id):
    db = get_db()
    user = current_user()
    conv = conversation_for_user(db, user, conv_id)
    if not conv:
        return json_error("Conversation not found.", 404)
    cursor, limit = parse_cursor(request.args)
    query = {"conversation_id": conv["_id"]}
    if cursor:
        query["_id"] = {"$lt": cursor}
    messages = list(db.messages.find(query).sort("_id", -1).limit(limit))
    messages.reverse()
    return json_ok(
        {
            "messages": [
                {
                    "id": str(m["_id"]),
                    "sender_id": str(m["sender_id"]),
                    "kind": m.get("kind"),
                    "ciphertext": m.get("ciphertext"),
                    "file_id": str(m["file_id"]) if m.get("file_id") else None,
                    "created_at": ser(m.get("created_at")),
                    "read_by": [str(r) for r in m.get("read_by", [])],
                }
                for m in messages
            ],
            "has_more": bool(cursor) or len(messages) == limit,
        }
    )


@bp.post("/conversations/<conv_id>/messages")
@login_required
def send_message(conv_id):
    db = get_db()
    user = current_user()
    conv = conversation_for_user(db, user, conv_id)
    if not conv:
        return json_error("Conversation not found.", 404)
    data = body_json()
    try:
        kind = jstr(data, "kind", 3, 6)
        ciphertext = jstr(data, "ciphertext", 20, 2_000_000)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    if kind not in ("text", "file"):
        return json_error("Unsupported message kind.", 422)
    file_id = None
    if data.get("file_id"):
        file_id = oid(data.get("file_id"))
        file_doc = db.files.find_one({"_id": file_id}) if file_id else None
        if not file_doc or file_doc["owner_id"] != user["_id"]:
            return json_error("Attachment not found.", 404)
        allowed_ref = conv.get("team_id") if conv.get("type") == "team" else conv["_id"]
        if str(file_doc.get("scope_ref")) != str(allowed_ref) or not file_doc.get("encrypted"):
            return json_error("Attachment does not belong to this conversation.", 403)

    doc = {
        "conversation_id": conv["_id"],
        "sender_id": user["_id"],
        "kind": kind,
        "ciphertext": ciphertext,
        "file_id": file_id,
        "read_by": [user["_id"]],
        "created_at": now(),
    }
    result = db.messages.insert_one(doc)
    message = {
        "id": str(result.inserted_id),
        "sender_id": str(user["_id"]),
        "kind": kind,
        "ciphertext": ciphertext,
        "file_id": str(file_id) if file_id else None,
        "created_at": ser(doc["created_at"]),
        "read_by": [str(user["_id"])],
    }
    payload = {"conversation_id": str(conv["_id"]), "message": message}
    if conv.get("type") == "team":
        team = db.teams.find_one({"_id": conv["team_id"]}) or {}
        emit_to_users(team.get("members", []), "chat:message", payload, skip=user["_id"])
    else:
        for uid in conv["participants"]:
            if uid != user["_id"]:
                emit_to_user(uid, "chat:message", payload)
    return json_ok({"message": message}, 201)


@bp.post("/conversations/<conv_id>/read")
@login_required
def mark_read(conv_id):
    db = get_db()
    user = current_user()
    conv = conversation_for_user(db, user, conv_id)
    if not conv:
        return json_error("Conversation not found.", 404)
    db.messages.update_many(
        {"conversation_id": conv["_id"], "sender_id": {"$ne": user["_id"]}},
        {"$addToSet": {"read_by": user["_id"]}},
    )
    payload = {"conversation_id": str(conv["_id"]), "user_id": str(user["_id"])}
    if conv.get("type") == "team":
        team = db.teams.find_one({"_id": conv["team_id"]}) or {}
        emit_to_users(team.get("members", []), "chat:read", payload, skip=user["_id"])
    else:
        for uid in conv["participants"]:
            if uid != user["_id"]:
                emit_to_user(uid, "chat:read", payload)
    return json_ok({"ok": True})
