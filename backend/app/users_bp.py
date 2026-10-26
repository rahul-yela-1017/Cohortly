"""Directory, profiles and E2EE public-key distribution (authenticated users only)."""
from __future__ import annotations

from flask import Blueprint, request

from .db import get_db
from .utils import (
    COLOR_RE,
    ValidationError,
    body_json,
    current_user,
    escape_regex,
    json_error,
    json_ok,
    jbool,
    jstr,
    login_required,
    oid,
    parse_cursor,
    public_profile,
    ser,
)

bp = Blueprint("users", __name__, url_prefix="/api")


@bp.get("/me")
@login_required
def me():
    user = current_user()
    return json_ok({"user": public_profile(user, viewer_id=user["_id"])})


@bp.patch("/me")
@login_required
def update_me():
    db = get_db()
    user = current_user()
    data = body_json()
    update = {}
    if "bio" in data:
        try:
            update["bio"] = jstr(data, "bio", 0, 280, required=True)
        except ValidationError as exc:
            return json_error(str(exc), 422)
    if "avatar_color" in data:
        color = data.get("avatar_color")
        if not (isinstance(color, str) and COLOR_RE.match(color)):
            return json_error("'avatar_color' must be a #rrggbb hex color.", 422)
        update["avatar_color"] = color
    if "privacy" in data and isinstance(data["privacy"], dict):
        privacy = dict(user.get("privacy", {}))
        privacy["show_email"] = jbool(data["privacy"], "show_email", privacy.get("show_email", False))
        privacy["show_bio"] = jbool(data["privacy"], "show_bio", privacy.get("show_bio", True))
        update["privacy"] = privacy
    if update:
        db.students.update_one({"_id": user["_id"]}, {"$set": update})
    user = db.students.find_one({"_id": user["_id"]})
    return json_ok({"user": public_profile(user, viewer_id=user["_id"])})


@bp.get("/me/keys")
@login_required
def my_keys():
    """The encrypted private key is ciphertext only — the server cannot read it."""
    user = current_user()
    return json_ok(
        {
            "public_key": user.get("public_key"),
            "encrypted_private_key": user.get("encrypted_private_key"),
        }
    )


@bp.post("/me/keys")
@login_required
def set_keys():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        public_key = jstr(data, "public_key", 50, 20000)
        encrypted_private_key = jstr(data, "encrypted_private_key", 50, 100000)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    db.students.update_one(
        {"_id": user["_id"]},
        {"$set": {"public_key": public_key, "encrypted_private_key": encrypted_private_key}},
    )
    return json_ok({"ok": True})


@bp.get("/directory")
@login_required
def directory():
    """Search approved, activated classmates. Returns limited profiles only."""
    db = get_db()
    user = current_user()
    q = (request.args.get("q") or "").strip()
    _, limit = parse_cursor(request.args)
    query = {"class_id": user.get("class_id"), "registered": True, "_id": {"$ne": user["_id"]}}
    if q:
        query["name"] = {"$regex": escape_regex(q), "$options": "i"}
    students = db.students.find(query).sort("name", 1).limit(limit)
    return json_ok({"results": [public_profile(s, viewer_id=user["_id"]) for s in students]})


@bp.get("/users/<user_id>")
@login_required
def user_profile(user_id):
    db = get_db()
    user = current_user()
    target = db.students.find_one({"_id": oid(user_id) or "0"})
    if not target or not target.get("registered") or target.get("class_id") != user.get("class_id"):
        return json_error("Classmate not found.", 404)
    profile = public_profile(target, viewer_id=user["_id"])
    profile["public_key"] = target.get("public_key")
    return json_ok({"user": profile})
