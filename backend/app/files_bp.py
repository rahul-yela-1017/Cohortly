"""File upload/download. Blobs live on disk; MongoDB stores metadata + permissions."""
from __future__ import annotations

from flask import Blueprint, request, send_file

from .chat_bp import conversation_for_user
from .db import get_db
from .storage import get_storage
from .utils import current_user, json_error, json_ok, login_required, now, oid, ser

bp = Blueprint("files", __name__, url_prefix="/api/files")

# scope types: dm | team | class  (dm/team payloads are E2EE ciphertext blobs)
SCOPES = {"dm", "team", "class"}


def _authorize_scope(db, user, scope_type: str, scope_ref) -> bool:
    if scope_type == "dm":
        return conversation_for_user(db, user, scope_ref) is not None and (
            db.conversations.find_one({"_id": scope_ref}) or {}
        ).get("type") == "dm"
    if scope_type == "team":
        team = db.teams.find_one({"_id": scope_ref})
        return bool(team and user["_id"] in team.get("members", []))
    if scope_type == "class":
        return True  # class-scoped notes are visible to every approved classmate
    return False


@bp.post("")
@login_required
def upload():
    db = get_db()
    user = current_user()
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return json_error("No file provided.", 422)
    scope_type = request.form.get("scope_type", "")
    scope_ref_raw = (request.form.get("scope_ref") or "").strip()
    # 'class' is a friendly alias for "my class" so clients need no class id.
    scope_ref = user["class_id"] if (scope_type == "class" and scope_ref_raw in ("class", "")) else oid(scope_ref_raw)
    encrypted = request.form.get("encrypted") == "true"
    manifest = request.form.get("manifest") or ""
    if len(manifest) > 8000:
        return json_error("Manifest too large.", 422)
    if manifest and not encrypted:
        return json_error("Manifest is only valid for encrypted uploads.", 422)
    if scope_type not in SCOPES or not scope_ref:
        return json_error("Invalid storage scope.", 422)
    if not _authorize_scope(db, user, scope_type, scope_ref):
        return json_error("You don't have permission to upload here.", 403)

    mime = (upload.mimetype or "application/octet-stream").split(";")[0].strip()
    if not encrypted and mime not in current_app_allowed_mimes():
        return json_error(f"File type '{mime}' is not allowed.", 415)
    if encrypted:
        mime = "application/octet-stream"

    max_bytes = _max_bytes()
    storage = get_storage()
    suffix = ".enc" if encrypted else ("." + (upload.filename.rsplit(".", 1)[-1] if "." in upload.filename else "bin"))
    key, size = storage.save(upload.stream, suffix)
    if size > max_bytes:
        storage.delete(key)
        return json_error(f"File exceeds the {max_bytes // (1024 * 1024)} MB limit.", 413)
    if size == 0:
        storage.delete(key)
        return json_error("Empty files can't be uploaded.", 422)

    doc = {
        "owner_id": user["_id"],
        "storage_key": key,
        # For E2EE uploads the real name/MIME stay inside the ciphertext.
        "filename": "attachment.enc" if encrypted else upload.filename[:180],
        "mime": mime,
        "size": size,
        "encrypted": encrypted,
        "manifest": manifest,
        "scope_type": scope_type,
        "scope_ref": scope_ref,
        "created_at": now(),
    }
    result = db.files.insert_one(doc)
    return json_ok({"file": _file_payload(db.files.find_one({"_id": result.inserted_id}))}, 201)


@bp.get("/<file_id>")
@login_required
def download(file_id):
    db = get_db()
    user = current_user()
    doc = db.files.find_one({"_id": oid(file_id) or "0"})
    if not doc:
        return json_error("File not found.", 404)
    allowed = doc["owner_id"] == user["_id"] or _authorize_scope(db, user, doc["scope_type"], doc["scope_ref"])
    if doc["scope_type"] == "class":
        allowed = True  # every approved classmate may read class resources
    if not allowed:
        return json_error("You don't have permission to download this file.", 403)
    storage = get_storage()
    if not storage.exists(doc["storage_key"]):
        return json_error("File blob is missing from storage.", 410)
    handle = storage.open(doc["storage_key"])
    return send_file(
        handle,
        mimetype=doc["mime"],
        as_attachment=True,
        download_name=doc["filename"],
    )


@bp.get("/<file_id>/meta")
@login_required
def meta(file_id):
    db = get_db()
    user = current_user()
    doc = db.files.find_one({"_id": oid(file_id) or "0"})
    if not doc:
        return json_error("File not found.", 404)
    return json_ok({"file": _file_payload(doc)})


@bp.delete("/<file_id>")
@login_required
def delete(file_id):
    db = get_db()
    user = current_user()
    doc = db.files.find_one({"_id": oid(file_id) or "0"})
    if not doc:
        return json_error("File not found.", 404)
    if doc["owner_id"] != user["_id"]:
        return json_error("Only the owner can delete this file.", 403)
    get_storage().delete(doc["storage_key"])
    db.files.delete_one({"_id": doc["_id"]})
    return json_ok({"ok": True})


def _file_payload(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "owner_id": str(doc["owner_id"]),
        "filename": doc["filename"],
        "mime": doc["mime"],
        "size": doc["size"],
        "encrypted": doc.get("encrypted", False),
        "manifest": doc.get("manifest", ""),
        "scope_type": doc["scope_type"],
        "scope_ref": str(doc["scope_ref"]),
        "created_at": ser(doc.get("created_at")),
    }


def _max_bytes() -> int:
    from flask import current_app

    return current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024


def current_app_allowed_mimes() -> set[str]:
    from flask import current_app

    return current_app.config["ALLOWED_MIMES"]
