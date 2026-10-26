"""MongoDB access layer.

Production uses MongoDB Atlas via MONGODB_URI. For local development without
credentials, the special scheme ``mongomock://`` provides an in-process server
so the whole stack can run offline. Indexes are created once at startup.
"""
from __future__ import annotations

from pymongo import ASCENDING, DESCENDING, IndexModel


def create_client(uri: str):
    if uri.startswith("mongomock://"):
        import mongomock

        return mongomock.MongoClient()
    from pymongo import MongoClient

    return MongoClient(uri, serverSelectionTimeoutMS=8000)


def init_db(app) -> None:
    client = create_client(app.config["MONGODB_URI"])
    db = client[app.config["MONGODB_DB"]]
    app.extensions["mongo_client"] = client
    app.extensions["db"] = db
    _ensure_indexes(db)


def get_db(app=None):
    from flask import current_app

    return (app or current_app).extensions["db"]


def _ensure_indexes(db) -> None:  # noqa: C901
    idx = {
        "students": [
            IndexModel([("roll_number", ASCENDING)], unique=True),
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("name", ASCENDING)]),
            IndexModel([("class_id", ASCENDING), ("registered", ASCENDING)]),
        ],
        "sessions": [
            IndexModel([("token_hash", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING)]),
        ],
        "password_resets": [
            IndexModel([("token_hash", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING)]),
        ],
        "conversations": [
            IndexModel([("dm_key", ASCENDING)], unique=True, sparse=True),
            IndexModel([("team_id", ASCENDING)], sparse=True),
            IndexModel([("participants", ASCENDING)]),
        ],
        "messages": [
            IndexModel([("conversation_id", ASCENDING), ("_id", DESCENDING)]),
            IndexModel([("conversation_id", ASCENDING), ("sender_id", ASCENDING), ("read_by", ASCENDING)]),
        ],
        "files": [
            IndexModel([("owner_id", ASCENDING)]),
            IndexModel([("scope_type", ASCENDING), ("scope_ref", ASCENDING)]),
        ],
        "teams": [IndexModel([("members", ASCENDING)])],
        "invitations": [
            IndexModel([("invitee_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("team_id", ASCENDING), ("status", ASCENDING)]),
        ],
        "posts": [
            IndexModel([("class_id", ASCENDING), ("_id", DESCENDING)]),
            IndexModel([("kind", ASCENDING), ("_id", DESCENDING)]),
            IndexModel([("course", ASCENDING)]),
        ],
        "replies": [IndexModel([("post_id", ASCENDING), ("_id", ASCENDING)])],
        "notes": [
            IndexModel([("class_id", ASCENDING), ("_id", DESCENDING)]),
            IndexModel([("course", ASCENDING)]),
        ],
        "study_groups": [
            IndexModel([("class_id", ASCENDING)]),
            IndexModel([("members", ASCENDING)]),
        ],
        "events": [IndexModel([("class_id", ASCENDING), ("starts_at", ASCENDING)])],
    }
    for name, models in idx.items():
        try:
            db[name].create_indexes(models)
        except Exception:  # pragma: no cover - mongomock partial-feature gaps
            pass
