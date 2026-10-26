"""Shared helpers: serialization, auth, validation, pagination, errors."""
from __future__ import annotations

import datetime as dt
import hashlib
import re
import secrets
from functools import wraps

from bson import ObjectId
from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db

# ---------------------------------------------------------------- serialization


def ser(value):
    """Recursively convert BSON documents to JSON-safe structures."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dt.datetime):
        return value.replace(tzinfo=dt.timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        return {k: ser(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [ser(v) for v in value]
    return value


def json_ok(data=None, status: int = 200):
    return jsonify(ser(data) if data is not None else {}), status


def json_error(message: str, status: int = 400, **extra):
    return jsonify({"error": message, **extra}), status


# ---------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    # scrypt when available (werkzeug >= 2.3), else its strongest default.
    try:
        return generate_password_hash(password, method="scrypt")
    except Exception:
        return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except Exception:
        return False


# ---------------------------------------------------------------- sessions


def new_session(db, user_id, ttl_days: int = 30) -> str:
    token = secrets.token_urlsafe(32)
    db.sessions.insert_one(
        {
            "token_hash": hashlib.sha256(token.encode()).hexdigest(),
            "user_id": ObjectId(user_id),
            "created_at": dt.datetime.utcnow(),
            "expires_at": dt.datetime.utcnow() + dt.timedelta(days=ttl_days),
        }
    )
    return token


def _session_user(db, token: str | None):
    if not token:
        return None
    doc = db.sessions.find_one({"token_hash": hashlib.sha256(token.encode()).hexdigest()})
    if not doc or doc["expires_at"] < dt.datetime.utcnow():
        return None
    return db.students.find_one({"_id": doc["user_id"]})


def bearer_token() -> str | None:
    """Session token from either transport header.

    The custom ``X-Session-Token`` header is checked first because some
    preview/hosting proxies strip or repurpose the standard ``Authorization``
    header. Both channels are accepted so curl/API clients keep working.
    """
    custom = request.headers.get("X-Session-Token", "").strip()
    if custom:
        return custom
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip() or None
    return None


def current_user():
    """Authenticated student document for this request, or None."""
    if "user" not in g:
        g.user = _session_user(get_db(), bearer_token())
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return json_error("Authentication required.", 401)
        if not user.get("registered"):
            return json_error("Account not activated.", 403)
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------- validation

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ROLL_RE = re.compile(r"^[A-Za-z0-9\-\/]{3,20}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def body_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {}
    return data


def jstr(data: dict, key: str, min_len: int = 1, max_len: int = 2000, required: bool = True, strip: bool = True):
    value = data.get(key)
    if value is None or not isinstance(value, str):
        if required:
            raise ValidationError(f"'{key}' is required.")
        return None
    value = value.strip() if strip else value
    if len(value) < min_len or len(value) > max_len:
        raise ValidationError(f"'{key}' must be {min_len}–{max_len} characters.")
    return value


def jbool(data: dict, key: str, default: bool) -> bool:
    value = data.get(key, default)
    return bool(value)


def jlist_str(data: dict, key: str, max_items: int = 8, max_len: int = 60) -> list[str]:
    value = data.get(key, [])
    if not isinstance(value, list):
        raise ValidationError(f"'{key}' must be a list.")
    out = []
    for item in value[:max_items]:
        if isinstance(item, str) and 0 < len(item.strip()) <= max_len:
            out.append(item.strip())
    return out


class ValidationError(Exception):
    pass


def oid(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except Exception:
        return None


def parse_cursor(args) -> tuple[ObjectId | None, int]:
    before = args.get("before")
    cursor = oid(before) if before else None
    try:
        limit = min(max(int(args.get("limit", 20)), 1), 50)
    except ValueError:
        limit = 20
    return cursor, limit


def escape_regex(text: str) -> str:
    return re.escape(text)


# ---------------------------------------------------------------- public profile


def public_profile(student, viewer_id=None) -> dict:
    """Limited profile: privacy settings decide what classmates see."""
    privacy = student.get("privacy", {})
    is_self = viewer_id is not None and str(student["_id"]) == str(viewer_id)
    out = {
        "id": str(student["_id"]),
        "name": student.get("name", ""),
        "roll_number": student.get("roll_number", ""),
        "avatar_color": student.get("avatar_color", "#6366f1"),
        "has_keys": bool(student.get("public_key")),
        "is_self": is_self,
    }
    if privacy.get("show_bio", True):
        out["bio"] = student.get("bio", "")
    if privacy.get("show_email", False) or is_self:
        out["email"] = student.get("email", "")
    if is_self:
        out["bio"] = student.get("bio", "")
        out["privacy"] = privacy
    return out


def now() -> dt.datetime:
    return dt.datetime.utcnow()
