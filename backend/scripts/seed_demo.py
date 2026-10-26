#!/usr/bin/env python3
"""Seed a demo class with SYNTHETIC students and content (no real roster data).

Creates demo accounts (password from DEMO_PASSWORD env, default `Demo@12345`),
plus feed posts, Q&A, notes (with a small generated PDF-like text file on disk
storage), study groups and events. E2EE keypairs are generated on each demo
user's device the first time they log in through the web app.

Usage:  python scripts/seed_demo.py
"""
from __future__ import annotations

import datetime as dt
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import os  # noqa: E402

from app.config import Config  # noqa: E402
from app.db import create_client  # noqa: E402
from app.storage import Storage  # noqa: E402
from app.utils import hash_password, now  # noqa: E402

DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Demo@12345")

STUDENTS = [
    ("SYN-1001", "Aarav Mehta", "aarav.mehta@synthetic.edu", "#6366f1", "Into ML, coffee, and midnight debug sessions."),
    ("SYN-1002", "Diya Iyer", "diya.iyer@synthetic.edu", "#14b8a6", "DBMS nerd. I collect ER diagrams like stickers."),
    ("SYN-1003", "Rohan Das", "rohan.das@synthetic.edu", "#f59e0b", "Full-stack tinkerer, part-time chess blunderer."),
    ("SYN-1004", "Ananya Rao", "ananya.rao@synthetic.edu", "#ec4899", "OS + networks. Ask me about past papers."),
    ("SYN-1005", "Kabir Shah", "kabir.shah@synthetic.edu", "#0ea5e9", ""),
    ("SYN-1006", "Ishita Nair", "ishita.nair@synthetic.edu", "#8b5cf6", ""),
    ("SYN-1007", "Vihaan Kulkarni", "vihaan.kulkarni@synthetic.edu", "#22c55e", ""),
    ("SYN-1008", "Meera Pillai", "meera.pillai@synthetic.edu", "#ef4444", ""),
]


def main() -> int:
    client = create_client(Config.MONGODB_URI)
    db = client[Config.MONGODB_DB]
    storage = Storage(Config.STORAGE_DIR)

    cls = db.classes.find_one({"code": Config.CLASS_CODE})
    if not cls:
        cls = db.classes.insert_one({"code": Config.CLASS_CODE, "name": Config.CLASS_NAME}).inserted_id
        cls = db.classes.find_one({"_id": cls})

    ids = {}
    for i, (roll, name, email, color, bio) in enumerate(STUDENTS):
        registered = i < 4  # first four synthetic students are activated demo logins
        doc = {
            "roll_number": roll,
            "name": name,
            "email": email,
            "class_id": cls["_id"],
            "registered": registered,
            "bio": bio,
            "avatar_color": color,
            "privacy": {"show_email": i % 2 == 0, "show_bio": True},
        }
        if registered:
            doc.update({"password_hash": hash_password(DEMO_PASSWORD), "activated_at": now()})
        db.students.update_one({"roll_number": roll}, {"$set": doc, "$setOnInsert": {}}, upsert=True)
        ids[roll] = db.students.find_one({"roll_number": roll})["_id"]

    aarav, diya, rohan, ananya = ids["SYN-1001"], ids["SYN-1002"], ids["SYN-1003"], ids["SYN-1004"]

    if db.posts.count_documents({}) == 0:
        db.posts.insert_many(
            [
                {
                    "class_id": cls["_id"], "author_id": ananya, "kind": "announcement", "title": "",
                    "body": "Placement prep mock interviews start next Monday in LH-2. Bring one printed copy of your resume.",
                    "course": "", "accepted_reply_id": None, "created_at": now() - dt.timedelta(days=2),
                },
                {
                    "class_id": cls["_id"], "author_id": rohan, "kind": "update", "title": "",
                    "body": "Uploaded my DBMS unit-3 summary to Notes. Corrections welcome — especially the normalisation examples.",
                    "course": "DBMS", "accepted_reply_id": None, "created_at": now() - dt.timedelta(days=1),
                },
                {
                    "class_id": cls["_id"], "author_id": diya, "kind": "question",
                    "title": "How do B+ trees handle bulk loading?",
                    "body": "Textbook says bulk loading is faster than repeated inserts, but I don't see why the fill factor changes. Anyone have a clean explanation?",
                    "course": "DBMS", "accepted_reply_id": None, "created_at": now() - dt.timedelta(hours=20),
                },
            ]
        )
        q = db.posts.find_one({"kind": "question"})
        r1 = db.replies.insert_one(
            {"post_id": q["_id"], "author_id": aarav, "created_at": now() - dt.timedelta(hours=18),
             "body": "Bulk loading sorts the entries first, then packs leaf pages at ~60-70% fill so later inserts don't split pages immediately. Repeated inserts split pages every time a node overflows — that's the wasted IO."}
        ).inserted_id
        db.replies.insert_one(
            {"post_id": q["_id"], "author_id": ananya, "created_at": now() - dt.timedelta(hours=9),
             "body": "Adding to that: with sorted input you write each page once, sequentially. Random inserts bounce all over the index."}
        )
        db.posts.update_one({"_id": q["_id"]}, {"$set": {"accepted_reply_id": r1}})
        db.comments.insert_one(
            {"post_id": db.posts.find_one({"kind": "announcement"})["_id"], "author_id": rohan,
             "body": "Is the resume copy for the interviewer or for us?", "created_at": now() - dt.timedelta(days=1)}
        )

    if db.notes.count_documents({}) == 0:
        note_text = (
            "SYNTHETIC DEMO NOTE\n\nUnit 3 - Indexing & B+ Trees\n"
            "1. Bulk loading packs leaves at a lower fill factor.\n"
            "2. Sequential writes avoid repeated page splits.\n"
            "3. Practice: GATE 2019 Q41.\n"
        ).encode("utf-8")
        key, size = storage.save(io.BytesIO(note_text), ".txt")
        db.files.insert_one(
            {"owner_id": rohan, "storage_key": key, "filename": "dbms-unit3-summary.txt", "mime": "text/plain",
             "size": size, "encrypted": False, "scope_type": "class",
             "scope_ref": cls["_id"], "created_at": now() - dt.timedelta(days=1)}
        )
        file_id = db.files.find_one({"storage_key": key})["_id"]
        db.notes.insert_many(
            [
                {"class_id": cls["_id"], "owner_id": rohan, "title": "DBMS Unit 3 — Indexing summary",
                 "description": "Short revision sheet with worked examples for B+ trees and bulk loading.",
                 "course": "DBMS", "topics": ["indexing", "b+trees"], "link": "", "body": "",
                 "file_id": file_id, "created_at": now() - dt.timedelta(days=1)},
                {"class_id": cls["_id"], "owner_id": aarav, "title": "OS scheduling cheat-sheet",
                 "description": "One-page comparison of SJF, RR, MLFQ with formulas.",
                 "course": "Operating Systems", "topics": ["scheduling"], "link": "",
                 "body": "SJF minimises average waiting time but starves long jobs.\nRR trades fairness for context-switch overhead.\nMLFQ approximates SJF by learning from observed behaviour.",
                 "file_id": None, "created_at": now() - dt.timedelta(hours=30)},
            ]
        )

    if db.study_groups.count_documents({}) == 0:
        db.study_groups.insert_many(
            [
                {"class_id": cls["_id"], "owner_id": diya, "name": "DBMS weekly problem set",
                 "description": "We solve one past-paper set every Sunday evening.", "course": "DBMS",
                 "schedule": "Sundays, 7pm, Library cubicle 4", "members": [diya, aarav], "created_at": now() - dt.timedelta(days=6)},
                {"class_id": cls["_id"], "owner_id": ananya, "name": "OS night-owls",
                 "description": "Late-night revision room for operating systems.", "course": "Operating Systems",
                 "schedule": "Wed & Fri, 10pm online", "members": [ananya], "created_at": now() - dt.timedelta(days=3)},
            ]
        )

    if db.events.count_documents({}) == 0:
        db.events.insert_many(
            [
                {"class_id": cls["_id"], "created_by": ananya, "title": "Mock placement interviews",
                 "description": "Round 1: technical. Fifteen minutes each.", "kind": "event",
                 "starts_at": now() + dt.timedelta(days=5), "ends_at": None, "location": "LH-2", "created_at": now()},
                {"class_id": cls["_id"], "created_by": diya, "title": "DBMS internal assessment",
                 "description": "Units 1-3, 30 marks.", "kind": "deadline",
                 "starts_at": now() + dt.timedelta(days=9), "ends_at": None, "location": "Exam cell", "created_at": now()},
                {"class_id": cls["_id"], "created_by": rohan, "title": "Class photo day",
                 "description": "Formals optional, smiles mandatory.", "kind": "event",
                 "starts_at": now() + dt.timedelta(days=14), "ends_at": None, "location": "Main lawn", "created_at": now()},
            ]
        )

    print("Demo seed complete (synthetic data only).")
    print(f"Demo logins: SYN-1001..SYN-1004 with password from DEMO_PASSWORD (default '{DEMO_PASSWORD}').")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
