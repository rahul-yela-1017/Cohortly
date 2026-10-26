"""Teams, invitations and membership-gated access."""
from __future__ import annotations

import secrets

from flask import Blueprint, request
from .db import get_db
from .limits import limiter
from .realtime import emit_to_user
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
    public_profile,
    ser,
)

bp = Blueprint("teams", __name__, url_prefix="/api")

AVATAR_COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#22c55e", "#ef4444"]


def team_for_user(db, user, team_id):
    team = db.teams.find_one({"_id": oid(team_id) or "0"})
    if not team:
        return None, None
    if user["_id"] in team.get("members", []):
        return team, "member"
    invite = db.invitations.find_one({"team_id": team["_id"], "invitee_id": user["_id"], "status": "pending"})
    return team, ("invited" if invite else None)


def _team_payload(db, team, role) -> dict:
    members = list(db.students.find({"_id": {"$in": team.get("members", [])}}))
    conv = db.conversations.find_one({"team_id": team["_id"]})
    return {
        "id": str(team["_id"]),
        "name": team.get("name"),
        "description": team.get("description", ""),
        "avatar_color": team.get("avatar_color", "#6366f1"),
        "owner_id": str(team.get("owner_id")),
        "members": [public_profile(m) for m in members],
        "conversation_id": str(conv["_id"]) if conv else None,
        "role": role,
        "created_at": ser(team.get("created_at")),
    }


@bp.post("/teams")
@limiter.limit("10 per hour")
@login_required
def create_team():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        name = jstr(data, "name", 3, 60)
        description = jstr(data, "description", 0, 280)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    team = {
        "name": name,
        "description": description,
        "owner_id": user["_id"],
        "members": [user["_id"]],
        "avatar_color": secrets.choice(AVATAR_COLORS),
        "class_id": user.get("class_id"),
        "created_at": now(),
    }
    result = db.teams.insert_one(team)
    # dm_key must be unique (sparse unique index); None would collide on the
    # second team ever created. Team conversations get a namespaced key.
    db.conversations.insert_one(
        {
            "type": "team",
            "team_id": result.inserted_id,
            "participants": [],
            "dm_key": f"team:{result.inserted_id}",
            "created_at": now(),
        }
    )
    team = db.teams.find_one({"_id": result.inserted_id})
    return json_ok({"team": _team_payload(db, team, "member")}, 201)


@bp.get("/teams")
@login_required
def list_teams():
    db = get_db()
    user = current_user()
    teams = list(db.teams.find({"members": user["_id"]}).sort("_id", -1).limit(100))
    return json_ok({"teams": [_team_payload(db, t, "member") for t in teams]})


@bp.get("/teams/<team_id>")
@login_required
def get_team(team_id):
    db = get_db()
    user = current_user()
    team, role = team_for_user(db, user, team_id)
    if not team:
        return json_error("Team not found.", 404)
    if role is None:
        return json_error("You don't have access to this team.", 403)
    payload = _team_payload(db, team, role)
    if role != "member":
        # Pending invitees see the team card only — never chat or files.
        payload["members"] = []
        payload["conversation_id"] = None
    return json_ok({"team": payload})


@bp.post("/teams/<team_id>/invitations")
@limiter.limit("20 per hour; 5 per minute")
@login_required
def invite(team_id):
    db = get_db()
    user = current_user()
    team, role = team_for_user(db, user, team_id)
    if not team or role != "member":
        return json_error("Only team members can invite classmates.", 403)
    data = body_json()
    invitee_id = oid(data.get("user_id") or "")
    invitee = db.students.find_one({"_id": invitee_id or "0", "registered": True, "class_id": user.get("class_id")})
    if not invitee:
        return json_error("Only classmates on your approved roster can be invited.", 404)
    if invitee["_id"] in team.get("members", []):
        return json_error("That classmate is already a member.", 409)
    if db.invitations.find_one({"team_id": team["_id"], "invitee_id": invitee["_id"], "status": "pending"}):
        return json_error("An invitation is already pending.", 409)
    doc = {
        "team_id": team["_id"],
        "invitee_id": invitee["_id"],
        "inviter_id": user["_id"],
        "status": "pending",
        "created_at": now(),
        "responded_at": None,
    }
    result = db.invitations.insert_one(doc)
    payload = _invite_payload(db, db.invitations.find_one({"_id": result.inserted_id}))
    emit_to_user(invitee["_id"], "invite:new", {"invitation": payload})
    return json_ok({"invitation": payload}, 201)


@bp.get("/teams/<team_id>/files")
@login_required
def team_files(team_id):
    db = get_db()
    user = current_user()
    team, role = team_for_user(db, user, team_id)
    if not team or role != "member":
        return json_error("Only accepted members can access team files.", 403)
    from .files_bp import _file_payload

    docs = list(db.files.find({"scope_type": "team", "scope_ref": team["_id"]}).sort("_id", -1).limit(200))
    return json_ok({"files": [_file_payload(d) for d in docs]})


@bp.get("/invitations")
@login_required
def list_invitations():
    db = get_db()
    user = current_user()
    direction = request.args.get("direction", "incoming")
    if direction == "outgoing":
        mine_teams = [t["_id"] for t in db.teams.find({"members": user["_id"]}, {"_id": 1})]
        invites = list(db.invitations.find({"team_id": {"$in": mine_teams}}).sort("_id", -1).limit(100))
    else:
        invites = list(db.invitations.find({"invitee_id": user["_id"]}).sort("_id", -1).limit(100))
    return json_ok({"invitations": [_invite_payload(db, i) for i in invites]})


@bp.post("/invitations/<invite_id>/respond")
@login_required
def respond(invite_id):
    db = get_db()
    user = current_user()
    invite = db.invitations.find_one({"_id": oid(invite_id) or "0"})
    if not invite or invite["invitee_id"] != user["_id"] or invite["status"] != "pending":
        return json_error("Invitation not found.", 404)
    data = body_json()
    action = data.get("action")
    if action not in ("accept", "decline"):
        return json_error("Action must be 'accept' or 'decline'.", 422)
    status = "accepted" if action == "accept" else "declined"
    db.invitations.update_one({"_id": invite["_id"]}, {"$set": {"status": status, "responded_at": now()}})
    if action == "accept":
        db.teams.update_one({"_id": invite["team_id"]}, {"$addToSet": {"members": user["_id"]}})
        team = db.teams.find_one({"_id": invite["team_id"]})
        for member in team.get("members", []):
            if member != user["_id"]:
                emit_to_user(member, "team:updated", {"team_id": str(team["_id"])})
    invite = db.invitations.find_one({"_id": invite["_id"]})
    payload = _invite_payload(db, invite)
    team = db.teams.find_one({"_id": invite["team_id"]})
    emit_to_user(team["owner_id"], "invite:updated", {"invitation": payload})
    return json_ok({"invitation": payload})


def _invite_payload(db, invite) -> dict:
    team = db.teams.find_one({"_id": invite["team_id"]}) or {}
    invitee = db.students.find_one({"_id": invite["invitee_id"]}) or {}
    inviter = db.students.find_one({"_id": invite["inviter_id"]}) or {}
    return {
        "id": str(invite["_id"]),
        "team_id": str(invite["team_id"]),
        "team_name": team.get("name", "Team"),
        "team_color": team.get("avatar_color", "#6366f1"),
        "invitee": public_profile(invitee) if invitee else None,
        "inviter": public_profile(inviter) if inviter else None,
        "status": invite.get("status"),
        "created_at": ser(invite.get("created_at")),
        "responded_at": ser(invite.get("responded_at")),
    }
