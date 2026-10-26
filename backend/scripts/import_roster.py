#!/usr/bin/env python3
"""One-time roster import.

Reads a CSV of approved students (columns: roll_number,name,email) and inserts
them into the private `students` collection as *unregistered* accounts. Real
roster files stay local and out of source control; only synthetic samples ship
with the repo.

Usage:
    python scripts/import_roster.py /path/to/roster.csv

The script prints counts only — never row contents.
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.db import create_client  # noqa: E402
from app.config import Config  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: import_roster.py <roster.csv>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"roster file not found: {path}", file=sys.stderr)
        return 2

    client = create_client(Config.MONGODB_URI)
    db = client[Config.MONGODB_DB]
    class_doc = db.classes.find_one({"code": Config.CLASS_CODE})
    if not class_doc:
        class_doc = db.classes.insert_one({"code": Config.CLASS_CODE, "name": Config.CLASS_NAME}).inserted_id
        class_doc = db.classes.find_one({"_id": class_doc})

    created = skipped = 0
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            roll = (row.get("roll_number") or "").strip().upper()
            name = (row.get("name") or "").strip()
            email = (row.get("email") or "").strip().lower()
            if not (roll and name and email):
                skipped += 1
                continue
            result = db.students.update_one(
                {"roll_number": roll},
                {
                    "$setOnInsert": {
                        "roll_number": roll,
                        "name": name,
                        "email": email,
                        "class_id": class_doc["_id"],
                        "registered": False,
                        "bio": "",
                        "avatar_color": "#6366f1",
                        "privacy": {"show_email": False, "show_bio": True},
                    }
                },
                upsert=True,
            )
            created += result.upserted_id is not None
            skipped += result.upserted_id is None
    print(f"Import complete: {created} new, {skipped} already present or invalid rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
