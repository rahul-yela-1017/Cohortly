#!/usr/bin/env python3
"""Audit helper: prove the database holds ciphertext only.

Scans `messages` and `files` metadata for the plaintext markers you pass in
(and for obvious plaintext message bodies) and reports what it finds.

Usage:
    python scripts/verify_ciphertext.py [needle ...]
Example:
    python scripts/verify_ciphertext.py pineapple-e2ee-1793002736755
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.config import Config  # noqa: E402
from app.db import create_client  # noqa: E402


def main() -> int:
    needles = sys.argv[1:]
    db = create_client(Config.MONGODB_URI)[Config.MONGODB_DB]
    problems = 0

    messages = list(db.messages.find())
    print(f"messages in db: {len(messages)}")
    for m in messages:
        ct = m.get("ciphertext", "")
        if not ct.startswith("-----BEGIN PGP MESSAGE-----"):
            print("  !! message without PGP ciphertext:", m["_id"])
            problems += 1
        for n in needles:
            if n in ct:
                print("  !! plaintext needle found in ciphertext:", n)
                problems += 1

    files = list(db.files.find())
    print(f"file metadata docs: {len(files)}")
    for f in files:
        if f.get("encrypted") and f.get("filename") != "attachment.enc":
            print("  !! encrypted file leaking original filename:", f["_id"], f.get("filename"))
            problems += 1
        blob = json.dumps({k: v for k, v in f.items() if k != "storage_key"}, default=str)
        for n in needles:
            if n in blob:
                print("  !! plaintext needle found in file metadata:", n)
                problems += 1

    students = list(db.students.find())
    for s in students:
        if not s.get("registered"):
            continue  # roster rows activate later; no hash yet is expected
        if s.get("password_hash", "").count("$") < 2:
            print("  !! student without a proper password hash:", s.get("roll_number"))
            problems += 1
        epk = s.get("encrypted_private_key", "")
        if epk and not epk.startswith("-----BEGIN PGP PRIVATE KEY BLOCK-----"):
            print("  !! private key not stored as armored ciphertext:", s.get("roll_number"))
            problems += 1
    print(f"students: {len(students)} (password hashes + encrypted key blobs checked)")

    print("RESULT:", "CLEAN — ciphertext only" if problems == 0 else f"{problems} PROBLEM(S)")
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
