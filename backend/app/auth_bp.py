"""Authentication: register (roster-gated), login, logout, password reset/change."""
from __future__ import annotations

import hashlib
import os
import smtplib
from email.mime.text import MIMEText

from flask import Blueprint, current_app, request
from .db import get_db
from .limits import limiter
from .utils import (
    ValidationError,
    body_json,
    hash_password,
    json_error,
    json_ok,
    jstr,
    login_required,
    current_user,
    new_session,
    now,
    public_profile,
    ser,
    verify_password,
)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _rate(key: str):
    return limiter.limit(key)


def _class_payload(student) -> dict:
    """Resolve class identity from the student's own class document.

    Falls back to the configured default class so single-class deployments
    behave exactly as before.
    """
    cls = None
    if student and student.get("class_id"):
        cls = get_db().classes.find_one({"_id": student["class_id"]})
    return {
        "class_code": (cls or {}).get("code") or current_app.config["CLASS_CODE"],
        "class_name": (cls or {}).get("name") or current_app.config["CLASS_NAME"],
    }


def public_user_payload(student) -> dict:
    return public_profile(student, viewer_id=student["_id"]) | _class_payload(student)


@bp.get("/class")
@login_required
def class_info():
    """Class identity for authenticated users only (never exposed pre-login)."""
    return json_ok(_class_payload(current_user()))


@bp.post("/login")
@_rate("10 per minute; 40 per hour")
def login():
    """Log in with college email (or roll number) + password.

    Accounts are pre-provisioned from the class roster — there is no public
    signup. A student's FIRST login uses their initial password: the roll
    number in CAPITAL letters (e.g. 25MVCSMR0630). That first success
    activates the account and stores the hashed initial password; the student
    can change it later from their profile.
    """
    db = get_db()
    data = body_json()
    identifier = (data.get("identifier") or "").strip().lower()
    password = data.get("password") or ""
    if not identifier or not password:
        return json_error("Enter your email (or roll number) and password.", 422)
    student = db.students.find_one(
        {"$or": [{"email": identifier}, {"roll_number": identifier.upper()}]}
    )
    if not student:
        return json_error("Invalid credentials.", 401)

    if student.get("registered") and student.get("password_hash"):
        ok = verify_password(student["password_hash"], password)
    else:
        # First login: the initial password is the roll number, capitalized.
        initial = student["roll_number"].upper()
        ok = password.strip().upper() == initial
        if ok:
            db.students.update_one(
                {"_id": student["_id"]},
                {
                    "$set": {
                        "registered": True,
                        "password_hash": hash_password(initial),
                        "activated_at": now(),
                    }
                },
            )
            student = db.students.find_one({"_id": student["_id"]})
    if not ok:
        return json_error("Invalid credentials.", 401)
    token = new_session(db, student["_id"], current_app.config["SESSION_TTL_DAYS"])
    return json_ok({"token": token, "user": public_user_payload(student)})


@bp.post("/logout")
@login_required
def logout():
    db = get_db()
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        db.sessions.delete_one({"token_hash": hashlib.sha256(header[7:].encode()).hexdigest()})
    return json_ok({"ok": True})


@bp.post("/forgot-password")
@_rate("3 per hour; 6 per day")
def forgot_password():
    db = get_db()
    data = body_json()
    identifier = (data.get("identifier") or "").strip().lower()
    # Always respond the same way so the endpoint cannot enumerate accounts.
    generic = {"ok": True, "message": "If that account exists, a reset link has been sent."}
    student = db.students.find_one({"$or": [{"email": identifier}, {"roll_number": identifier.upper()}]})
    if not student or not student.get("registered"):
        return json_ok(generic)

    import secrets

    token = secrets.token_urlsafe(32)
    db.password_resets.insert_one(
        {
            "token_hash": hashlib.sha256(token.encode()).hexdigest(),
            "user_id": student["_id"],
            "created_at": now(),
            "expires_at": now()
            + __import__("datetime").timedelta(minutes=current_app.config["RESET_TTL_MINUTES"]),
            "used": False,
        }
    )
    link = f"{request.headers.get('Origin', '').rstrip('/')}/reset-password?token={token}"
    if current_app.config["MAIL_HOST"]:
        _send_mail(
            student["email"],
            "Reset your Cohortly password",
            f"Hi {student['name']},\n\nReset your password within "
            f"{current_app.config['RESET_TTL_MINUTES']} minutes:\n{link}\n\n"
            "If you didn't request this, ignore this email.",
        )
    else:
        # Development fallback (no SMTP configured): console only, never the roster.
        current_app.logger.warning("SMTP not configured — password reset link: %s", link)
    return json_ok(generic)


@bp.post("/reset-password")
@_rate("6 per hour")
def reset_password():
    db = get_db()
    data = body_json()
    try:
        token = jstr(data, "token", 10, 200)
        password = jstr(data, "password", 8, 128, strip=False)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    reset = db.password_resets.find_one({"token_hash": hashlib.sha256(token.encode()).hexdigest()})
    if not reset or reset.get("used") or reset["expires_at"] < now():
        return json_error("This reset link is invalid or has expired.", 410)
    db.students.update_one({"_id": reset["user_id"]}, {"$set": {"password_hash": hash_password(password)}})
    db.password_resets.update_one({"_id": reset["_id"]}, {"$set": {"used": True}})
    db.sessions.delete_many({"user_id": reset["user_id"]})
    return json_ok({"ok": True})


@bp.post("/change-password")
@_rate("6 per hour")
@login_required
def change_password():
    db = get_db()
    user = current_user()
    data = body_json()
    try:
        current = jstr(data, "current_password", 1, 128, strip=False)
        new = jstr(data, "new_password", 8, 128, strip=False)
    except ValidationError as exc:
        return json_error(str(exc), 422)
    if not verify_password(user.get("password_hash", ""), current):
        return json_error("Current password is incorrect.", 403)
    db.students.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(new)}})
    header = request.headers.get("Authorization", "")
    keep = hashlib.sha256(header[7:].encode()).hexdigest() if header.startswith("Bearer ") else None
    db.sessions.delete_many({"user_id": user["_id"], "token_hash": {"$ne": keep}})
    return json_ok({"ok": True})


def _send_mail(to: str, subject: str, text: str) -> None:
    cfg = current_app.config
    msg = MIMEText(text)
    msg["Subject"] = subject
    msg["From"] = cfg["MAIL_FROM"]
    msg["To"] = to
    try:
        with smtplib.SMTP(cfg["MAIL_HOST"], cfg["MAIL_PORT"], timeout=10) as server:
            if cfg["MAIL_USE_TLS"]:
                server.starttls()
            if cfg["MAIL_USERNAME"]:
                server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            server.send_message(msg)
    except OSError as exc:  # pragma: no cover
        current_app.logger.error("SMTP delivery failed: %s", exc)
