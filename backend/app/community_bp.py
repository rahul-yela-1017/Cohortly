"""Class community: feed + comments, course Q&A with accepted answers, notes &
resources, study groups, events & deadlines."""
from __future__ import annotations

from flask import Blueprint, request

from .db import get_db
from .realtime import emit_to_user
from .utils import (
    ValidationError,
    body_json,
    current_user,
    json_error,
    json_ok,
    jlist_str,
    jstr,
    login_required,
    now,
    oid,
    parse_cursor,
    public_profile,
    ser,
)

bp = Blueprint("community", __name__, url_prefix="/api")

POST_KINDS = {"announcement", "question", "update"}


def _author(db, doc):
    student = db.students.find_one({"_id": doc.get("author_id")})
    return public_profile(student) if student else {"id": "", "name": "Unknown", "avatar_color": "#94a3b8"}


def _post_payload(db, post, with_replies=False) -> dict:
    payload = {
        "id": str(post["_id"]),
        "kind": post.get("kind"),
        "title": post.get("title", ""),
        "body": post.get("body", ""),
        "course": post.get("course", ""),
        "author": _author(db, post),
        "created_at": ser(post.get("created_at")),
        "comment_count": db.comments.count_documents({"post_id": post["_id"]}),
        "reply_count": db.replies.count_documents({"post_id": post["_id"]}),
        "accepted_reply_id": str(post["accepted_reply_id"]) if post.get("accepted_reply_id") else None,
    }
    if with_replies:
        replies = list(db.replies.find({"post_id": post["_id"]}).sort("_id", 1).limit(200))
        payload["replies"] = [
            {
                "id": str(r["_id"]),
                "body": r.get("body"),
                "author": _author(db, r),
                "created_at": ser(r.get("created_at")),
                "is_accepted": str(r["_id"]) == payload["accepted_reply_id"],
            }
            for r in replies
        ]
    return payload


# ------------------------------------------------------------------ feed


@bp.get("/posts")
@login_required
def list_posts():
    db = get_db()
    user = current_user()
    cursor, limit = parse_cursor(request.args)
    kind = request.args.get("kind")
    query = {"class_id": user.get("class_id")}
    if kind in POST_KINDS:
        query["kind"] = kind
    if cursor:
        query["_id"] = {"$lt": cursor}
    posts = list(db.posts.find(query).sort("_id", -1).limit(limit))
    return json_ok(
        {
            "posts": [_post_payload(db, p) for p in posts],
            "next_cursor": str(posts[-1]["_id"]) if len(posts) == limit else None,
        }
    )


@bp.post("/posts")
@login_required
def create_post():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        kind = jstr(data, "kind", 3, 12)
        body = jstr(data, "body", 1, 4000)
        title = jstr(data, "title", 0, 140)
        course = jstr(data, "course", 0, 60)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    if kind not in POST_KINDS:
        return json_error("Kind must be announcement, question or update.", 422)
    if kind == "question" and not title:
        return json_error("Questions need a short title.", 422)
    doc = {
        "class_id": user.get("class_id"),
        "author_id": user["_id"],
        "kind": kind,
        "title": title,
        "body": body,
        "course": course,
        "accepted_reply_id": None,
        "created_at": now(),
    }
    result = db.posts.insert_one(doc)
    return json_ok({"post": _post_payload(db, db.posts.find_one({"_id": result.inserted_id}))}, 201)


@bp.delete("/posts/<post_id>")
@login_required
def delete_post(post_id):
    db = get_db()
    user = current_user()
    post = db.posts.find_one({"_id": oid(post_id) or "0"})
    if not post:
        return json_error("Post not found.", 404)
    if post["author_id"] != user["_id"]:
        return json_error("Only the author can delete this post.", 403)
    db.posts.delete_one({"_id": post["_id"]})
    db.comments.delete_many({"post_id": post["_id"]})
    db.replies.delete_many({"post_id": post["_id"]})
    return json_ok({"ok": True})


@bp.get("/posts/<post_id>/comments")
@login_required
def list_comments(post_id):
    db = get_db()
    user = current_user()
    post = db.posts.find_one({"_id": oid(post_id) or "0", "class_id": user.get("class_id")})
    if not post:
        return json_error("Post not found.", 404)
    cursor, limit = parse_cursor(request.args)
    query = {"post_id": post["_id"]}
    if cursor:
        query["_id"] = {"$lt": cursor}
    comments = list(db.comments.find(query).sort("_id", -1).limit(limit))
    comments.reverse()
    return json_ok(
        {
            "comments": [
                {
                    "id": str(c["_id"]),
                    "body": c.get("body"),
                    "author": _author(db, c),
                    "created_at": ser(c.get("created_at")),
                }
                for c in comments
            ],
            "next_cursor": str(comments[-1]["_id"]) if len(comments) == limit else None,
        }
    )


@bp.post("/posts/<post_id>/comments")
@login_required
def create_comment(post_id):
    db = get_db()
    user = current_user()
    post = db.posts.find_one({"_id": oid(post_id) or "0", "class_id": user.get("class_id")})
    if not post:
        return json_error("Post not found.", 404)
    data = body_json()
    try:
        body = jstr(data, "body", 1, 2000)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    doc = {"post_id": post["_id"], "author_id": user["_id"], "body": body, "created_at": now()}
    result = db.comments.insert_one(doc)
    if post["author_id"] != user["_id"]:
        emit_to_user(
            post["author_id"],
            "feed:comment",
            {"post_id": str(post["_id"]), "comment": {"id": str(result.inserted_id), "body": body, "author": public_profile(user)}},
        )
    return json_ok(
        {"comment": {"id": str(result.inserted_id), "body": body, "author": public_profile(user), "created_at": ser(doc["created_at"])}},
        201,
    )


# ------------------------------------------------------------------ Q&A


@bp.get("/questions")
@login_required
def list_questions():
    db = get_db()
    user = current_user()
    cursor, limit = parse_cursor(request.args)
    course = request.args.get("course")
    status = request.args.get("status")
    query = {"class_id": user.get("class_id"), "kind": "question"}
    if course:
        query["course"] = course
    if cursor:
        query["_id"] = {"$lt": cursor}
    posts = list(db.posts.find(query).sort("_id", -1).limit(limit))
    out = []
    for p in posts:
        payload = _post_payload(db, p)
        payload["answered"] = bool(p.get("accepted_reply_id"))
        if status == "open" and payload["answered"]:
            continue
        if status == "answered" and not payload["answered"]:
            continue
        out.append(payload)
    return json_ok({"questions": out, "next_cursor": str(posts[-1]["_id"]) if len(posts) == limit else None})


@bp.get("/questions/<post_id>")
@login_required
def get_question(post_id):
    db = get_db()
    user = current_user()
    post = db.posts.find_one({"_id": oid(post_id) or "0", "kind": "question", "class_id": user.get("class_id")})
    if not post:
        return json_error("Question not found.", 404)
    return json_ok({"question": _post_payload(db, post, with_replies=True)})


@bp.post("/questions/<post_id>/replies")
@login_required
def reply(post_id):
    db = get_db()
    user = current_user()
    post = db.posts.find_one({"_id": oid(post_id) or "0", "kind": "question", "class_id": user.get("class_id")})
    if not post:
        return json_error("Question not found.", 404)
    data = body_json()
    try:
        body = jstr(data, "body", 1, 4000)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    doc = {"post_id": post["_id"], "author_id": user["_id"], "body": body, "created_at": now()}
    result = db.replies.insert_one(doc)
    if post["author_id"] != user["_id"]:
        emit_to_user(
            post["author_id"],
            "qa:reply",
            {"post_id": str(post["_id"]), "reply": {"id": str(result.inserted_id), "body": body, "author": public_profile(user)}},
        )
    return json_ok(
        {
            "reply": {
                "id": str(result.inserted_id),
                "body": body,
                "author": public_profile(user),
                "created_at": ser(doc["created_at"]),
                "is_accepted": False,
            }
        },
        201,
    )


@bp.post("/replies/<reply_id>/accept")
@login_required
def accept_reply(reply_id):
    db = get_db()
    user = current_user()
    reply = db.replies.find_one({"_id": oid(reply_id) or "0"})
    if not reply:
        return json_error("Reply not found.", 404)
    post = db.posts.find_one({"_id": reply["post_id"]})
    if not post or post["author_id"] != user["_id"]:
        return json_error("Only the question author can mark a helpful answer.", 403)
    db.posts.update_one({"_id": post["_id"]}, {"$set": {"accepted_reply_id": reply["_id"]}})
    return json_ok({"ok": True, "accepted_reply_id": str(reply["_id"])})


# ------------------------------------------------------------------ notes


@bp.get("/notes")
@login_required
def list_notes():
    db = get_db()
    user = current_user()
    cursor, limit = parse_cursor(request.args)
    course = request.args.get("course")
    q = request.args.get("q")
    query = {"class_id": user.get("class_id")}
    if course:
        query["course"] = course
    if q:
        query["title"] = {"$regex": __import__("re").escape(q), "$options": "i"}
    if cursor:
        query["_id"] = {"$lt": cursor}
    notes = list(db.notes.find(query).sort("_id", -1).limit(limit))
    out = []
    for n in notes:
        file_doc = db.files.find_one({"_id": n["file_id"]}) if n.get("file_id") else None
        out.append(
            {
                "id": str(n["_id"]),
                "title": n.get("title"),
                "description": n.get("description", ""),
                "course": n.get("course", ""),
                "topics": n.get("topics", []),
                "link": n.get("link", ""),
                "body": n.get("body", ""),
                "owner": _author(db, n),
                "file": (
                    {
                        "id": str(file_doc["_id"]),
                        "filename": file_doc["filename"],
                        "mime": file_doc["mime"],
                        "size": file_doc["size"],
                    }
                    if file_doc
                    else None
                ),
                "created_at": ser(n.get("created_at")),
            }
        )
    return json_ok({"notes": out, "next_cursor": str(notes[-1]["_id"]) if len(notes) == limit else None})


@bp.post("/notes")
@login_required
def create_note():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        title = jstr(data, "title", 3, 140)
        description = jstr(data, "description", 0, 600)
        course = jstr(data, "course", 1, 60)
        link = jstr(data, "link", 0, 400)
        body = jstr(data, "body", 0, 20000)
        topics = jlist_str(data, "topics")
    except ValidationError as exc:
        return json_error(str(exc), 422)
    file_id = oid(data.get("file_id") or "") if data.get("file_id") else None
    if file_id:
        file_doc = db.files.find_one({"_id": file_id})
        if not file_doc or file_doc["owner_id"] != user["_id"] or file_doc["scope_type"] != "class":
            return json_error("Attached file not found.", 404)
    doc = {
        "class_id": user.get("class_id"),
        "owner_id": user["_id"],
        "title": title,
        "description": description,
        "course": course,
        "topics": topics,
        "link": link,
        "body": body,
        "file_id": file_id,
        "created_at": now(),
    }
    result = db.notes.insert_one(doc)
    return json_ok({"id": str(result.inserted_id)}, 201)


@bp.delete("/notes/<note_id>")
@login_required
def delete_note(note_id):
    db = get_db()
    user = current_user()
    note = db.notes.find_one({"_id": oid(note_id) or "0"})
    if not note:
        return json_error("Note not found.", 404)
    if note["owner_id"] != user["_id"]:
        return json_error("Only the owner can delete this note.", 403)
    if note.get("file_id"):
        file_doc = db.files.find_one({"_id": note["file_id"]})
        if file_doc:
            from .storage import get_storage

            get_storage().delete(file_doc["storage_key"])
            db.files.delete_one({"_id": file_doc["_id"]})
    db.notes.delete_one({"_id": note["_id"]})
    return json_ok({"ok": True})


# ------------------------------------------------------------------ study groups


@bp.get("/study-groups")
@login_required
def list_groups():
    db = get_db()
    user = current_user()
    groups = list(db.study_groups.find({"class_id": user.get("class_id")}).sort("_id", -1).limit(100))
    out = []
    for grp in groups:
        members = list(db.students.find({"_id": {"$in": grp.get("members", [])}}))
        out.append(
            {
                "id": str(grp["_id"]),
                "name": grp.get("name"),
                "description": grp.get("description", ""),
                "course": grp.get("course", ""),
                "schedule": grp.get("schedule", ""),
                "members": [public_profile(m) for m in members],
                "owner_id": str(grp.get("owner_id")),
                "is_member": user["_id"] in grp.get("members", []),
                "created_at": ser(grp.get("created_at")),
            }
        )
    return json_ok({"groups": out})


@bp.post("/study-groups")
@login_required
def create_group():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        name = jstr(data, "name", 3, 60)
        description = jstr(data, "description", 0, 280)
        course = jstr(data, "course", 0, 60)
        schedule = jstr(data, "schedule", 0, 120)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    doc = {
        "class_id": user.get("class_id"),
        "owner_id": user["_id"],
        "name": name,
        "description": description,
        "course": course,
        "schedule": schedule,
        "members": [user["_id"]],
        "created_at": now(),
    }
    result = db.study_groups.insert_one(doc)
    return json_ok({"id": str(result.inserted_id)}, 201)


@bp.post("/study-groups/<group_id>/join")
@login_required
def join_group(group_id):
    db = get_db()
    user = current_user()
    grp = db.study_groups.find_one({"_id": oid(group_id) or "0", "class_id": user.get("class_id")})
    if not grp:
        return json_error("Study group not found.", 404)
    db.study_groups.update_one({"_id": grp["_id"]}, {"$addToSet": {"members": user["_id"]}})
    return json_ok({"ok": True})


@bp.post("/study-groups/<group_id>/leave")
@login_required
def leave_group(group_id):
    db = get_db()
    user = current_user()
    grp = db.study_groups.find_one({"_id": oid(group_id) or "0", "class_id": user.get("class_id")})
    if not grp:
        return json_error("Study group not found.", 404)
    if grp["owner_id"] == user["_id"] and len(grp.get("members", [])) > 1:
        return json_error("The group owner can't leave while others are members.", 409)
    db.study_groups.update_one({"_id": grp["_id"]}, {"$pull": {"members": user["_id"]}})
    return json_ok({"ok": True})


# ------------------------------------------------------------------ events


@bp.get("/events")
@login_required
def list_events():
    db = get_db()
    user = current_user()
    scope = request.args.get("scope", "upcoming")
    query = {"class_id": user.get("class_id")}
    if scope == "upcoming":
        query["starts_at"] = {"$gte": now() - __import__("datetime").timedelta(hours=2)}
    events = list(db.events.find(query).sort("starts_at", 1).limit(100))
    out = []
    for ev in events:
        creator = db.students.find_one({"_id": ev.get("created_by")})
        out.append(
            {
                "id": str(ev["_id"]),
                "title": ev.get("title"),
                "description": ev.get("description", ""),
                "kind": ev.get("kind", "event"),
                "starts_at": ser(ev.get("starts_at")),
                "ends_at": ser(ev.get("ends_at")),
                "location": ev.get("location", ""),
                "created_by": public_profile(creator) if creator else None,
                "is_owner": ev.get("created_by") == user["_id"],
            }
        )
    return json_ok({"events": out})


@bp.post("/events")
@login_required
def create_event():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        title = jstr(data, "title", 3, 120)
        description = jstr(data, "description", 0, 600)
        kind = jstr(data, "kind", 3, 10)
        starts_at = jstr(data, "starts_at", 10, 40)
        location = jstr(data, "location", 0, 120)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    if kind not in ("event", "deadline"):
        return json_error("Kind must be 'event' or 'deadline'.", 422)
    import datetime as dt

    try:
        starts = dt.datetime.fromisoformat(starts_at)
    except ValueError:
        return json_error("'starts_at' must be an ISO datetime.", 422)
    doc = {
        "class_id": user.get("class_id"),
        "created_by": user["_id"],
        "title": title,
        "description": description,
        "kind": kind,
        "starts_at": starts,
        "ends_at": None,
        "location": location,
        "created_at": now(),
    }
    result = db.events.insert_one(doc)
    return json_ok({"id": str(result.inserted_id)}, 201)


@bp.delete("/events/<event_id>")
@login_required
def delete_event(event_id):
    db = get_db()
    user = current_user()
    ev = db.events.find_one({"_id": oid(event_id) or "0"})
    if not ev:
        return json_error("Event not found.", 404)
    if ev["created_by"] != user["_id"]:
        return json_error("Only the creator can delete this event.", 403)
    db.events.delete_one({"_id": ev["_id"]})
    return json_ok({"ok": True})
