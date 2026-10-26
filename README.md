# Cohortly

A private, production-quality community platform for **one college class**: verified classmate
directory, end-to-end encrypted 1:1 and team chat with attachments, teams with invitations,
class feed, course Q&A with accepted answers, notes & resources, study groups, and events —
built with **React + TypeScript + Tailwind**, a **Flask REST + SocketIO** backend and
**MongoDB Atlas**.

![logo](frontend/public/logo.png)

---

## 1. Features

| Area | What works today |
| --- | --- |
| Landing | Public marketing page with logo, feature carousel (keyboard + reduced-motion aware, slow autoplay that stops on interaction) and a single **Log in** CTA. No roster or class content before login. |
| Accounts | Pre-provisioned from the roster — **no public signup**. Students log in with their college email (or roll number); the initial password on first login is the **roll number in CAPITAL letters** (e.g. `25MVCSMR0630`), which activates the account and creates their E2EE keys on-device in the same step. Logout, forgot/reset password (SMTP or console fallback), change password any time (re-wraps the E2EE key seamlessly). Passwords hashed with scrypt/pbkdf2 — never plaintext. Students are encouraged to change the initial password after first login. |
| Directory | Search approved, activated classmates; limited profiles (bio/email honour privacy toggles); start a 1:1 conversation. |
| Chat | Real-time delivery (Flask-SocketIO), history with cursor pagination, timestamps, day dividers, unread badges, read receipts, typing indicators, encrypted attachments, empty/locked/error states. |
| E2EE | OpenPGP (RFC 9580) via `openpgp.js`. See §5. |
| Teams | Create team, invite classmates, pending/accepted/declined statuses, member-gated team chat + encrypted file space. Pending invitees get **no** team content (403 enforced server-side). |
| Community | Class feed (announcements/updates/questions) with comments, course Q&A with replies + "helpful answer", notes & resources by course/topic (file, link or inline), study groups (create/join/leave), events & deadlines calendar. |
| Files | Blobs on disk/object storage — never inside MongoDB. Metadata, ownership, scope and permissions in MongoDB. Type allow-list + 25 MB cap. Every download re-checks permissions. |
| Ops | Rate limits on login/reset/invites, cursor pagination everywhere, indexes for every hot query, structured permission checks on every protected route. |

## 2. Repository layout

```
backend/
  app/                  Flask application factory, blueprints, realtime, storage
    auth_bp.py          login / logout / forgot / reset / change-password
    users_bp.py         profile, privacy, directory, E2EE public-key distribution
    chat_bp.py          conversations + E2EE message transport (REST)
    files_bp.py         upload/download + permission enforcement
    teams_bp.py         teams, invitations, team files
    community_bp.py     feed, comments, Q&A, notes, study groups, events
    realtime.py         Flask-SocketIO handshake auth + relay events
    storage.py          disk/object storage abstraction
    db.py               Mongo client + index creation
  scripts/
    import_roster.py    one-time CSV roster import (prints counts only)
    sample_roster.synthetic.csv   synthetic roster for demos/tests
    seed_demo.py        synthetic demo class + content
    verify_ciphertext.py          audit: DB holds ciphertext only
  wsgi.py               entry point
frontend/
  src/
    lib/crypto.ts       OpenPGP keyring, encrypt/decrypt text+binary, IDB cache
    lib/api.ts          fetch client, token handling, authenticated downloads
    lib/socket.ts       Socket.IO singleton
    components/         AppShell, Carousel, MessageThread, UI kit, icons
    pages/              Landing, auth, feed, directory, chat, teams, Q&A, notes,
                        groups, events, profile
  e2e.mjs               Playwright end-to-end test (two browsers, real E2EE)
```

## 3. Setup

### Prerequisites
- Python 3.11+, Node 18+, a MongoDB Atlas cluster (or local `mongod`).

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # fill in real values

# 1) import the approved roster (CSV: roll_number,name,email) — one time
python scripts/import_roster.py /secure/path/roster.csv

# 2) optional: synthetic demo class (never real data)
python scripts/seed_demo.py

# 3) run (dev). Production: see §7
python wsgi.py                  # http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api + /socket.io → :5000)
```

### Environment variables (`backend/.env`, see `.env.example`)

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | signs/protects server-side secrets; generate randomly |
| `MONGODB_URI` / `MONGODB_DB` | Atlas connection string (`mongodb+srv://…`). Use `mongomock://local` for an offline in-memory dev database. |
| `CLASS_CODE` / `CLASS_NAME` | the single class this deployment serves |
| `STORAGE_DIR` | where file blobs live (mount/NFS/S3-backed POSIX path in prod) |
| `MAX_UPLOAD_MB` | upload cap (default 25) |
| `CORS_ORIGINS` | allowed browser origins |
| `MAIL_*` | optional SMTP for password-reset emails |
| `RATELIMIT_STORAGE_URI` | `memory://` default; use `redis://…` with multiple workers |

No secrets are committed: `.env.example` holds placeholders only, and the real roster never
enters the repo, frontend bundles, logs or seed data.

## 4. Roster handling & privacy

- `scripts/import_roster.py` upserts `students` rows as **inactive** accounts. There is no public
  signup: a student activates by logging in for the first time with their college email (or roll
  number) and the initial password — their **roll number in CAPITAL letters**. Only rostered
  emails/rolls exist, so no outsider can get an account.
- `roll_number` and `email` carry unique indexes.
- The script prints **counts only**; no endpoint exposes the full roster — the directory returns
  activated classmates with limited fields, filtered by each student's privacy settings.
- Demo content is fully synthetic (`SYN-…` roll numbers, `@synthetic.edu` emails).

## 5. End-to-end encryption — design & honest limits

Implementation: **OpenPGP (RFC 9580)** through `openpgp.js` — an established, widely reviewed
library — with Curve25519 keypairs.

- Keypairs are generated **in the browser** on first login (the initial-password login that
  activates a rostered account creates them in the same step). The private key is wrapped with
  a passphrase derived from the account password **before** leaving the device; the server
  stores only that ciphertext plus the public key.
- Messages and chat/team attachments are encrypted **to every participant's public key** on
  the sender's device. The server relays and stores ciphertext only; attachment original
  names/MIME/sizes travel inside an encrypted manifest.
- Decryption happens only in participants' browsers. A decrypted copy of the private key is
  cached in **IndexedDB on that device** (like Signal desktop) so reloads don't re-prompt;
  "Lock keys" / "Clear cached keys" remove it.
- `backend/scripts/verify_ciphertext.py` audits the database: every message starts with
  `-----BEGIN PGP MESSAGE-----`, encrypted files are stored as `attachment.enc`, private keys
  are armored ciphertext, and passwords are proper hashes.

**Documented limitations (by design of a web client, not oversights):**
1. *Malicious-server caveat:* the server verifies passwords at login, so a compromised server
   could in theory capture a password and unwrap the stored key backup. This is inherent to
   browser-delivered E2EE (the server also serves the JS). Database breaches, however, yield
   ciphertext only.
2. *History vs. new members:* team messages are encrypted to the member set at send time; a
   member who joins later cannot decrypt earlier messages (standard for recipient-set
   encryption). Undecryptable items render as "Unable to decrypt", never as plaintext.
3. *Email-based password reset:* the old key wrap was made with the old password. The unlock
   dialog offers "start over with new keys"; old ciphertext then stays unreadable — the correct
   E2EE behaviour, surfaced honestly in the UI.
4. Changing the password in-app re-wraps the private key automatically on that device.

Nothing in the UI is labelled end-to-end encrypted unless it actually is: class-scoped notes
are server-visible by design and are presented without E2EE claims.

## 6. Testing

```bash
# backend running + frontend dev server running, then:
cd frontend && npm run test:e2e          # Playwright: two browsers, real crypto
cd backend  && python scripts/verify_ciphertext.py <needle-from-e2e>
```

The e2e suite logs in as two synthetic students, exchanges E2EE DMs (both directions), checks
unread badges, creates a team, sends + accepts an invitation, verifies a non-member gets
**403** on team files, and delivers an encrypted attachment whose original filename only
appears after local decryption.

## 7. Production notes

- Serve Flask with a SocketIO-capable worker, e.g.
  `gunicorn --worker-class eventlet -w 1 wsgi:app` (or gevent), behind TLS.
- Point `RATELIMIT_STORAGE_URI` at Redis when scaling workers.
- Swap `app/storage.py`'s `Storage` for an S3-backed implementation (same interface) if you
  prefer object storage; metadata stays in MongoDB either way.
- Configure `MAIL_*` so password resets go by email; without it the token is printed to the
  server console (development fallback only).

## 8. Known incomplete / deliberately scoped out

- Single class per deployment (product decision).
- No message edit/delete, no push notifications, no group DMs beyond teams.
- Carousel visuals are product-UI mockups (intentional: no unrelated stock photos).
- `mongomock://` mode is for offline development; data is in-memory and lost on restart.
