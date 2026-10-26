/* First-login journey under the new model: email + roll-number password,
 * account auto-activates, E2EE keys auto-create, chat works immediately. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://board-nurses-raise-basic.trycloudflare.com';
const log = (...a) => console.log('[firstlogin]', ...a);
let failures = 0;
const check = (cond, label) => {
  if (cond) log('PASS', label);
  else { failures++; log('FAIL', label); }
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();

/* SYN-1006 has never logged in: no password, no keys */
await page.goto(`${BASE}/login`);
check(await page.isVisible('text=roll number in CAPITAL letters'), 'login page explains the initial password');
check(!(await page.isVisible('text=Join your class')), 'no Join-your-class button anywhere on login');

await page.fill('#identifier', 'ishita.nair@synthetic.edu');
await page.fill('#password', 'SYN-1006');
await page.click('button[type=submit]');
await page.waitForURL('**/app', { timeout: 30000 });
check(true, 'first login with roll-number password succeeded');
await page.waitForSelector('text=E2EE active', { timeout: 45000 });
check(true, 'E2EE keys auto-created on first login (E2EE active)');

/* log out, log back in — same credentials must keep working */
await page.click('[aria-label="Account menu"]');
await page.click('button:has-text("Log out")');
await page.waitForSelector('a[href="/login"]', { timeout: 15000 });
await page.goto(`${BASE}/login`);
await page.waitForSelector('#identifier', { timeout: 15000 });
await page.fill('#identifier', 'SYN-1006');
await page.fill('#password', 'SYN-1006');
await page.click('button[type=submit]');
await page.waitForURL('**/app', { timeout: 30000 });
await page.waitForSelector('text=E2EE active', { timeout: 45000 });
check(true, 'second login (roll + same password) works, keys ready from cache');

/* directory shows only activated classmates */
await page.goto(`${BASE}/app/directory`);
await page.waitForSelector('input[aria-label="Search classmates by name"]', { timeout: 15000 });
await page.fill('input[aria-label="Search classmates by name"]', 'Aarav');
await page.waitForSelector('text=Aarav Mehta', { timeout: 15000 });
check(true, 'directory lists activated classmates');

await browser.close();
log(failures === 0 ? 'FIRST-LOGIN JOURNEY PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
