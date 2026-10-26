# Cohortly — Complete Project Description

> **Cohortly** is a private, production-quality community platform built for **one college class**.
> Every account is pre-provisioned from the official class roster, every message and file is
> **end-to-end encrypted (E2EE)** in the browser, and everything a class needs — directory, chat,
> teams, feed, Q&A, notes, study groups and events — lives in one place.
>
> Repository: `https://github.com/rahul-yela-1017/Cohortly`

---

## 1. The problem it solves

College class communication is scattered across WhatsApp groups (no privacy, no structure),
Drive folders (no permissions), and notice boards (no discussion). Cohortly replaces all of it
with a single verified space where:

- **Only rostered students can join** — there is no public signup at all.
- **Messages and attachments are ciphertext on the server** — not even the admin can read them.
- **Content is organised** by course, topic, team and deadline instead of one endless chat scroll.

---

## 2. Tech stack

| Layer | Technology | Version | Why it's used |
|---|---|---|---|
| Frontend framework | **React** | 18.3 | Component-based SPA UI |
| Language (frontend) | **TypeScript** | 5.5 | Type safety across ~40 modules |
| Styling | **Tailwind CSS** | 3.4 | Design-system utilities, responsive layouts |
| Build tool / dev server | **Vite** | 5.4 | Fast HMR; dev proxy for `/api` + `/socket.io` (single origin, no CORS) |
| Routing | **React Router** | 6.26 | Client-side routes (`/`, `/login`, `/app/...`) |
| Realtime client | **socket.io-client** | 4.7 | WebSocket chat with polling fallback |
| Cryptography | **openpgp.js** (OpenPGP, RFC 9580) | 5.11.2 | Curve25519 E2EE keypairs, encrypt/decrypt in-browser |
| Key cache | **IndexedDB** | browser | Encrypted-private-key cache per device (best-effort) |
| Fonts | **Inter** (`@fontsource-variable/inter`) | 5.0 | Accessible, modern typeface |
| Backend framework | **Flask** | ≥3.0 | REST API (blueprints per domain) |
| Realtime server | **Flask-SocketIO** | ≥5.3 | Live chat delivery, typing indicators, per-user rooms |
| CORS | **Flask-CORS** | ≥4.0 | Origin allow-list from env |
| Rate limiting | **Flask-Limiter** | ≥3.5 | Brute-force protection on auth + invites |
| Database driver | **PyMongo** | ≥4.6 | MongoDB access, indexes, cursor pagination |
| Database | **MongoDB (Atlas / self-hosted)** | 6+/7 | Document store; 12 collections with tuned indexes |
| Password hashing | **scrypt** (werkzeug) | — | Strong KDF; pbkdf2 fallback |
| File storage | **Disk/object storage** (`STORAGE_DIR`) | — | Blobs never stored inside MongoDB |
| Config | **python-dotenv** + env vars | ≥1.0 | Secrets never committed (`.env.example` placeholders only) |
| E2E tests | **Playwright** (Chromium) | 1.47 | Two-browser realtime E2EE tests |
| Runtime | **Python** 3.11+, **Node** 20+ | — | — |

---

## 3. Architecture at a glance

```
 Browser (React SPA)
   │  HTTPS, same origin
   ▼
 Vite dev server ──proxy /api, /socket.io──▶ Flask (REST blueprints + SocketIO)
   │                                            │  PyMongo            │  Storage class
   ▼                                            ▼                     ▼
 openpgp.js encrypts/decrypts               MongoDB (Atlas)      Disk file storage
 on the device; server only ever            12 collections,      (encrypted blobs;
 sees ciphertext                             unique indexes       metadata in Mongo)
```

- **Single origin**: the browser only talks to one host; the dev server proxies API + WebSocket
  traffic, so there is no CORS surface and no internal host leakage.
- **Stateless sessions**: bearer tokens hashed (SHA-256) in a `sessions` collection with TTL-style
  expiry; a secondary `X-Session-Token` header survives hosting proxies that strip `Authorization`.
- **Messages & files are separate documents** — no unbounded arrays; history is cursor-paginated.
- **Permission checks on every protected route**: ownership, team membership, conversation
  participation and file scope are re-verified server-side for each request (ID-swapping attacks
  return 403/404, proven by tests).

---

## 4. Accounts & authentication model

1. The admin imports the official roster once with `scripts/import_roster.py`
   (CSV: `roll_number,name,email`) → students are created as **inactive** accounts
   (`roll_number` + `email` unique indexes). The script prints **counts only** — no PII in logs.
2. **No public signup exists** (`/api/auth/register` was removed; the UI has no Join button).
3. A student's **first login** uses their college email (or roll number) plus the **initial
   password = roll number in CAPITAL letters** (e.g. `25MVCSMR0630`). That first success:
   - activates the account (stores a scrypt hash of the initial password), and
   - generates their **OpenPGP keypair in the browser**, wrapping the private key with a
     passphrase derived from the password **before** upload — in one seamless step.
4. Later logins verify the stored hash; the password can be changed any time from Profile
   (the change **re-wraps the E2EE private key** with the new passphrase automatically).
5. Forgot-password → reset link (SMTP if configured, console-only fallback in dev);
   reset/change endpoints are rate-limited.

**Rate limits:** login `10/min, 40/hour` · forgot-password `3/hour, 6/day` ·
reset `6/hour` · team create `10/hour` · invitations `20/hour, 5/min`.

---

## 5. End-to-end encryption — design & honest limits

- **Protocol/implementation**: OpenPGP (RFC 9580) via `openpgp.js`, Curve25519 — an established,
  publicly reviewed library. No custom cryptography.
- **Key lifecycle**: generated in-browser on first login → private key encrypted with a
  passphrase derived from the account password → only ciphertext + public key stored server-side.
  Devices cache the decrypted key in IndexedDB; the cache can be locked/cleared from Profile.
- **What is encrypted**: 1:1 messages, team messages, typing-adjacent metadata stays minimal,
  and **chat/team attachments** (file bytes are encrypted client-side; the server stores an
  `application/octet-stream` blob plus metadata).
- **What the server can see**: ciphertext, sender/receiver IDs, timestamps, file names/sizes
  after decryption locally only — file *names* travel encrypted inside the message payload.
- **Honest limitations (documented in README §5)**:
  1. A malicious server could swap public keys (no out-of-band fingerprint verification UI yet).
  2. Messages sent before a key rotation are not retroactively decryptable by new keys.
  3. Password reset via email produces a new keywrap; old messages need the old passphrase.
  4. Device cache (IndexedDB) is only as safe as the device.

---

## 6. Database schema (MongoDB)

| Collection | Purpose | Key indexes |
|---|---|---|
| `students` | Roster + auth + profile + privacy + public key | unique `roll_number`, unique `email`, `name`, (`class_id`,`registered`) |
| `classes` | The single class this deployment serves | — |
| `sessions` | Bearer-token sessions | unique `token_hash`, `user_id` |
| `password_resets` | Reset tokens | unique `token_hash`, `user_id` |
| `conversations` | DM + team conversation headers | unique sparse `dm_key`, sparse `team_id`, `participants` |
| `messages` | Individual messages (ciphertext) | (`conversation_id`,`_id` desc), (`conversation_id`,`sender_id`,`read_by`) |
| `files` | File metadata/ownership/scope | `owner_id`, (`scope_type`,`scope_ref`) |
| `teams` | Teams + members | `members` |
| `invitations` | Team invites (pending/accepted/declined) | (`invitee_id`,`status`), (`team_id`,`status`) |
| `posts` | Class feed (announcement/question/update) | (`class_id`,`_id` desc) |
| `questions`/`replies` | Course Q&A + helpful-answer marks | course + recency indexes |
| `notes`, `study_groups`, `events` | Resources, groups, deadlines | scope + recency indexes |

---

## 7. Feature-by-feature walkthrough (with the buttons/controls on each screen)

### 7.1 Landing page (public, pre-login)
- Hero, logo, and a **4-slide feature carousel**: *Find your classmates*, *Message privately,
  end-to-end encrypted*, *Create teams for projects & study*, *Share notes that stay organised*.
- Carousel controls: **Previous / Next arrows**, **dot indicators** ("Go to slide n: …"),
  keyboard arrow support, slow auto-advance that **pauses on interaction**, honours
  `prefers-reduced-motion`; visuals are product-UI illustrations, not stock photos.
- Buttons: **Log in** (header + hero + bottom CTA). No roster/class content is exposed pre-login
  (`/api/health` returns status only; class identity requires auth).

### 7.2 Login / Forgot / Reset
- Fields: **College email** (roll number also accepted), **Password**.
- Buttons: **Log in**, **Forgot password?** → *Send reset link*; reset page → *Update password*.
- Inline hint: first-time password = roll number in CAPITAL letters.
- Error/loading states: field-level error banner, spinner on submit, rate-limit messaging.

### 7.3 App shell (after login)
- Sidebar navigation: **Class feed · Classmates · Chat · Teams · Q&A · Notes · Study groups ·
  Events** (active-state highlighting; mobile drawer with **Open menu / Close menu**).
- Header: **E2EE status chip** (`E2EE active` / `Keys locked` / `Set up E2EE` — clicking opens the
  key dialog), **account menu** → *Profile & privacy*, *Encryption keys*, *Log out*.
- Key dialogs: **Unlock** (password), **Create my keys**, escape hatch
  **Confirm: create new keys** (regenerate), toast confirmations.
- Locked-state banner with **Unlock now / Set up now**; the dialog **auto-prompts** when keys
  need attention, and clicking a locked composer re-opens it (the keyboard never dies).

### 7.4 Class feed
- Composer: type chips (**Announcement / Update / Question**), title (for questions), 4000-char
  body with live counter, **Post** button (disabled until valid, spinner while posting).
- Feed cards with author avatar, kind chip, timestamp; **comment** toggle + comment box;
  empty / loading / error-with-**Try again** states; cursor pagination on scroll.

### 7.5 Classmate directory
- **Search classmates by name** (server-side, limited fields, privacy-respecting).
- Per-row buttons: **View** (limited profile modal: bio/email per privacy toggles) and
  **Message** (opens/creates a 1:1 encrypted conversation).

### 7.6 Chat (1:1, realtime, E2EE)
- Left rail: **conversation search / start new**, conversation list with **unread badges**,
  last-message preview; empty state *"No conversations yet"*.
- Thread: day dividers, timestamps, lock icon on ciphertext bubbles, typing indicator,
  read receipts; composer **textarea** (*Enter* sends, *Shift+Enter* newline),
  **Send message** button, **paperclip → "Choose a file to attach (encrypted on your device)"**
  (hidden input *"Attach an encrypted file"*, 25 MB cap, type allow-list).
- Attachments download via authenticated fetch and **decrypt locally**; original filename only
  exists inside the encrypted payload.
- Realtime via SocketIO rooms (participant-only); polling fallback where WebSockets are blocked.

### 7.7 Teams
- List page: **New team** (name + description modal → **Create team**), incoming/outgoing
  invitation cards with **Accept / Decline**, status chips (pending/accepted/declined).
- Team detail tabs: **chat · files · members**.
  - Members tab: **Invite** (classmate search → per-row **Invite**, "Invitation sent" state).
    Pending invitees get **zero** team content (server returns 403).
  - Files tab: upload button, per-file **Download** (member-only, permission re-checked).
  - Chat tab: same E2EE composer/attachments as DMs, scoped to members.

### 7.8 Course Q&A
- **Ask a question** modal (title, course, body) → **Post question**.
- Question list with status filter chips; detail view with replies → **Post reply**;
  asker can mark one reply as **"Helpful answer"** (highlighted badge, success toast).

### 7.9 Notes & resources
- **Share a note** modal: title, course/topic, type (file / link / inline text) →
  **Share with class**; file notes upload to storage with metadata in Mongo.
- Cards show course/topic chips; file notes offer authenticated **Download**.

### 7.10 Study groups
- **New group** modal → **Create group**; cards show member count and focus;
  per-card **Join / Leave** toggle button.

### 7.11 Events & deadlines
- Upcoming/past scopes; **Add event** modal (title, kind, date/time, location) → create;
  per-event **Add to calendar** (generates `.ics` client-side).

### 7.12 Profile & privacy
- Edit display name/bio/avatar colour → **Save changes**.
- Privacy toggles: show email / show bio (directory honours them server-side).
- Security card: **Change password** form → **Update password** (re-wraps E2EE key);
  **Lock keys on this device**; **Clear cached keys (this browser)**; key fingerprint display.
- **Log out**.

---

## 8. Security & privacy checklist

- Roster-only accounts; **no signup endpoint**; unique roll/email indexes.
- scrypt password hashing; sessions are SHA-256 hashes with expiry; logout revokes server-side.
- Rate limits on login, reset, team creation, invitations.
- Permission re-checks on every protected action (conversation participant, team member, file
  scope/owner); ID-swap attempts → 403/404 (covered by E2E assertions).
- Upload allow-list (MIME) + 25 MB cap; blobs on disk, metadata in Mongo; downloads re-authorised.
- Ciphertext-only storage for messages/attachments; server never holds plaintext keys.
- No roster/class leakage pre-login; directory returns limited fields per privacy toggles.
- Secrets via env vars; `.env.example` placeholders only; real roster lives in git-ignored
  `private/`; import/seed scripts print counts, never rows.

## 9. Accessibility & UX polish

- Full keyboard support: carousel arrows/indicators, focus rings, modal Escape + focus move,
  labelled inputs (`aria-label`) and dialogs (`role=dialog`, `aria-modal`).
- `prefers-reduced-motion` disables carousel autoplay and animations.
- Consistent **loading / empty / error / success** states everywhere (skeletons, empty
  illustrations, *Try again* error cards, toast notifications).
- Responsive from 360 px phones to desktop; mobile drawer nav and bottom-sheet modals.

## 10. Testing & QA

- `frontend/e2e.mjs` (Playwright, two browsers): login → realtime bidirectional E2EE DMs →
  unread badges → team create/invite/accept → team chat E2EE → non-member 403 on team files →
  encrypted attachment round-trip. **All green.**
- `frontend/keytest.mjs`: typing behaviour across ready/locked keyring states, focus stability.
- `frontend/firstlogin.mjs`: first-login journey (initial password → activation → key creation).
- `backend/scripts/verify_ciphertext.py`: audits the DB to prove **ciphertext-only** storage.
- `backend/scripts/import_roster.py` (idempotent upserts) and `seed_demo.py` (synthetic demo
  class only — real roster never enters seeds, bundles, logs or screenshots).

## 11. Repository layout

```
Cohortly/
├── README.md                  # setup, env table, privacy rules, E2EE design + limits
├── PROJECT_DESCRIPTION.md     # this document
├── .gitignore                 # .env, private/, var/, caches, node_modules, shots…
├── backend/
│   ├── app/                   # Flask blueprints: auth, users, chat, teams, community,
│   │                          #   files, realtime, config, db(indexes), storage, limits, utils
│   ├── scripts/               # import_roster.py, seed_demo.py, verify_ciphertext.py
│   ├── requirements.txt
│   ├── wsgi.py
│   └── .env.example           # placeholders only
└── frontend/
    ├── src/
    │   ├── components/        # AppShell, MessageThread, Carousel, ui kit, icons
    │   ├── context/           # Auth (session + keyring), Toast
    │   ├── lib/               # api client, crypto (openpgp), socket, time, types
    │   ├── pages/             # Landing, AuthPages, Feed, Directory, Chat, Teams,
    │   │                      #   TeamDetail, QA, Notes, Groups, Events, Profile
    │   └── App.tsx / main.tsx
    ├── e2e.mjs · keytest.mjs · firstlogin.mjs
    ├── index.html · vite.config.ts · tailwind config · package.json
    └── public/logo.png        # class logo
```

## 12. Run it yourself (quickstart)

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # fill MONGODB_URI, SECRET_KEY, CLASS_CODE…
python scripts/import_roster.py /path/to/roster.csv   # one-time, private file
python wsgi.py                  # http://localhost:5000

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api + /socket.io)

# tests
npm run test:e2e                # Playwright suite
```

Students then: open the site → **Log in** → college email + **ROLL NUMBER IN CAPITALS** →
keys are created on their device → they're in. Change password any time from Profile.

## 13. Known limitations & future work

- E2EE trust-on-first-use (no fingerprint comparison UI) — see §5 limits.
- Forgot-password emails need SMTP configuration in production.
- Single-class deployment by design (one `CLASS_CODE` per instance); multi-tenant is future work.
- No push notifications yet; realtime relies on open tabs.
- WebSocket upgrades depend on the hosting proxy (polling fallback keeps chat working).

---

*Cohortly — your class, connected. Privately.*
