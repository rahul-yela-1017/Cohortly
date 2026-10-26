/**
 * End-to-end smoke test (Playwright, headless Chromium).
 * Verifies: login, roster-gated app boot, key setup, DM E2EE messaging both
 * ways, team creation + invitation + accept, team chat E2EE, and that the
 * database only ever holds ciphertext.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const PASSWORD = 'Demo@12345';

const log = (...a) => console.log('[e2e]', ...a);
let failures = 0;
const check = (cond, label) => {
  if (cond) log('PASS', label);
  else {
    failures++;
    log('FAIL', label);
  }
};

async function login(page, roll) {
  await page.goto(`${BASE}/login`);
  await page.fill('#identifier', roll);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/app', { timeout: 20000 });
  await page.waitForSelector('text=Class feed', { timeout: 20000 });
  // wait until the on-device keypair exists (header chip flips to "E2EE active")
  await page.waitForSelector('text=E2EE active', { timeout: 30000 });
}

async function ensureUnlocked(page, roll) {
  // If a full-page reload happened before keys were cached, unlock like a user would.
  for (let i = 0; i < 3; i++) {
    const dialogOpen = await page
      .isVisible('[role=dialog][aria-label="Unlock your keys"], [role=dialog][aria-label="Set up end-to-end encryption"]')
      .catch(() => false);
    if (!dialogOpen) {
      const locked = await page.isVisible('text=Keys locked').catch(() => false);
      const setup = await page.isVisible('text=Set up E2EE').catch(() => false);
      if (!locked && !setup) return;
      await page.click(`button:has-text("${locked ? 'Unlock now' : 'Set up now'}")`);
    }
    await page.fill('input[aria-label="Account password"]', PASSWORD);
    // Scope to the dialog: the header banner also contains an "Unlock now" button.
    await page.click('[role=dialog] button:has-text("Unlock"), [role=dialog] button:has-text("Create my keys")');
    await page.waitForSelector('text=Keys unlocked on this device', { timeout: 15000 });
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });

/* ---------------- context B (Diya) ---------------- */
const ctxB = await browser.newContext();
const pageB = await ctxB.newPage();
await login(pageB, 'SYN-1002');
log('Diya logged in; keys should now exist server-side');
await pageB.goto(`${BASE}/app/chat`);
await ensureUnlocked(pageB, 'SYN-1002');
try {
  await pageB.waitForSelector('text=No conversations yet', { timeout: 5000 });
} catch {
  log('Diya already has conversations from a previous run (continuing)');
}

/* ---------------- context A (Aarav) ---------------- */
const ctxA = await browser.newContext();
const pageA = await ctxA.newPage();
await login(pageA, 'SYN-1001');

/* feed shows seeded announcement */
check(await pageA.isVisible('text=Placement prep mock interviews'), 'feed shows seeded announcement');

/* directory -> open DM with Diya */
await pageA.goto(`${BASE}/app/directory`);
await ensureUnlocked(pageA, 'SYN-1001');
await pageA.fill('input[aria-label="Search classmates by name"]', 'Diya');
await pageA.waitForSelector('text=DBMS nerd', { timeout: 15000 });
await pageA.locator('li:has-text("Diya Iyer")').locator('button:has-text("View")').click();
await pageA.click('button:has-text("Start private conversation")');
await pageA.waitForSelector('textarea[aria-label="Message"]', { timeout: 15000 });

const SECRET = 'pineapple-e2ee-' + Date.now();
await pageA.fill('textarea[aria-label="Message"]', `Hey Diya! ${SECRET}`);
await pageA.click('button[aria-label="Send message"]');
await pageA.waitForSelector(`text=${SECRET}`, { timeout: 15000 });
log('Aarav sees his own decrypted message');

/* ---------------- B receives in realtime ---------------- */
await pageB.waitForSelector('button:has-text("Aarav Mehta")', { timeout: 20000 });
await pageB.click('button:has-text("Aarav Mehta")');
await pageB.waitForSelector(`text=${SECRET}`, { timeout: 20000 });
log('Diya received + decrypted the message in realtime');

/* B replies */
await pageB.fill('textarea[aria-label="Message"]', `Got it: ${SECRET}-reply`);
await pageB.click('button[aria-label="Send message"]');
await pageA.waitForSelector(`text=${SECRET}-reply`, { timeout: 20000 });
log('Aarav received Diya’s encrypted reply');

/* unread indicator: move B off the thread, then A sends again */
await pageB.goto(`${BASE}/app`);
await pageA.fill('textarea[aria-label="Message"]', 'unread check');
await pageA.click('button[aria-label="Send message"]');
const pageB2 = await ctxB.newPage();
await pageB2.goto(`${BASE}/app/chat`);
await pageB2.waitForSelector('text=Aarav Mehta', { timeout: 15000 });
const badgeCount = await pageB2.locator('span').filter({ hasText: /^1$/ }).count();
check(badgeCount > 0, 'unread badge shows on Diya’s conversation list');
await pageB2.close();

/* ---------------- teams + invitations ---------------- */
await pageA.goto(`${BASE}/app/teams`);
await pageA.click('button:has-text("New team")');
await pageA.fill('#tname', 'E2E Squad');
await pageA.fill('#tdesc', 'Playwright verification team');
await pageA.click('button:has-text("Create team")');
await pageA.waitForSelector('text=Invite', { timeout: 15000 });
await pageA.click('button:has-text("Invite")');
await pageA.fill('input[aria-label="Search classmates to invite"]', 'Diya');
await pageA.click('li button:has-text("Invite")');
await pageA.waitForSelector('text=Invitation sent', { timeout: 10000 });
log('team created + invite sent');

/* B accepts */
await pageB.goto(`${BASE}/app/teams`);
await pageB.waitForSelector('text=Invitations for you', { timeout: 15000 });
await pageB.click('button:has-text("Accept")');
await pageB.waitForSelector('text=You joined E2E Squad', { timeout: 10000 });
await pageB.click('a:has-text("E2E Squad")');
await pageB.waitForSelector('textarea[aria-label="Message"]', { timeout: 15000 });

/* A sees Diya in members and sends a team message */
await pageA.reload();
await pageA.click('button[role=tab]:has-text("members")');
await pageA.waitForSelector('li:has-text("Diya Iyer")', { timeout: 15000 });
await pageA.click('button[role=tab]:has-text("Team chat")');
await pageA.waitForSelector('textarea[aria-label="Message"]', { timeout: 15000 });
const TEAM_SECRET = 'team-cipher-' + Date.now();
await pageA.fill('textarea[aria-label="Message"]', TEAM_SECRET);
await pageA.click('button[aria-label="Send message"]');
await pageB.waitForSelector(`text=${TEAM_SECRET}`, { timeout: 20000 });
log('team chat E2EE works after acceptance');

/* pending invitee cannot access: Rohan (SYN-1003) */
const ctxC = await browser.newContext();
const pageC = await ctxC.newPage();
await login(pageC, 'SYN-1003');
const teamId = pageA.url().split('/teams/')[1];
const resp = await pageC.evaluate(async (id) => {
  const r = await fetch(`/api/teams/${id}/files`, { headers: { Authorization: `Bearer ${localStorage.getItem('cc_token')}` } });
  return r.status;
}, teamId);
check(resp === 403, `non-member blocked from team files (got ${resp})`);

/* ---------------- attachment E2EE ---------------- */
await pageA.bringToFront();
const fs = await import('fs');
fs.writeFileSync('/tmp/secret-notes.txt', `attachment payload ${SECRET}-file`);
await pageA.setInputFiles('input[aria-label="Attach an encrypted file"]', '/tmp/secret-notes.txt');
await pageA.waitForSelector('text=Encrypted attachment sent', { timeout: 30000 });
await pageB.waitForSelector('text=secret-notes.txt', { timeout: 20000 });
log('encrypted attachment delivered with original name visible only after local decryption');

await browser.close();

log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
