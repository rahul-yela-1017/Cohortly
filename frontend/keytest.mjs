/* Verify typing behavior in the chat composer: ready + locked keyring states.
 * Runs through the public tunnel by default (same path real users take). */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://board-nurses-raise-basic.trycloudflare.com';
const PASSWORD = 'Demo@12345';
const log = (...a) => console.log('[keytest]', ...a);
let failures = 0;
const check = (cond, label) => {
  if (cond) log('PASS', label);
  else { failures++; log('FAIL', label); }
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

/* ---- phase 1: fresh login auto-unlocks; typing + send must work ---- */
await page.goto(`${BASE}/login`);
await page.fill('#identifier', 'SYN-1001');
await page.fill('#password', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/app', { timeout: 30000 });
await page.waitForSelector('text=E2EE active', { timeout: 30000 });
log('logged in; keyring auto-unlocked on login');

await page.goto(`${BASE}/app/chat`);
await page.waitForSelector('text=Diya Iyer', { timeout: 15000 });
await page.locator('button:has-text("Diya Iyer")').first().click();
const ta = page.locator('textarea[aria-label="Message"]');
await ta.waitFor({ timeout: 15000 });
await ta.click();
const T1 = 'typing works after login 123';
await page.keyboard.type(T1, { delay: 5 });
check((await ta.inputValue()) === T1, 'phase 1: typed text appears');
await page.keyboard.press('Enter');
await page.waitForSelector(`text=${T1}`, { timeout: 20000 });
check(true, 'phase 1: message sent + rendered');

/* ---- phase 2: simulate a fresh device — clear key cache, reload -> locked ---- */
await page.goto(`${BASE}/app/profile`);
await page.click('button:has-text("Clear cached keys")');
await page.waitForTimeout(600);
// dismiss any dialog that auto-opened for the transient 'setup' state
if (await page.isVisible('[role=dialog]').catch(() => false)) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
await page.reload();
await page.waitForSelector('text=Keys locked', { timeout: 20000 });
log('reloaded with empty key cache: keyring is locked');

const autoOpened = await page
  .waitForSelector('[role=dialog][aria-label="Unlock your keys"]', { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check(autoOpened, 'phase 2: unlock dialog auto-prompted after boot with locked keys');
if (autoOpened) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

await page.goto(`${BASE}/app/chat`);
await page.waitForSelector('text=Diya Iyer', { timeout: 15000 });
// dismiss the auto-prompt from this fresh page load before interacting
for (let i = 0; i < 3; i++) {
  if (await page.isVisible('[role=dialog]').catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else break;
}
await page.locator('button:has-text("Diya Iyer")').first().click();
const ta2 = page.locator('textarea[aria-label="Message"]');
await ta2.waitFor({ timeout: 15000 });
// Playwright treats aria-disabled as "not enabled"; real browsers still fire
// click on a readOnly + aria-disabled textarea (the ARIA pattern we use so the
// locked composer stays focusable and opens the unlock dialog).
const nativeDisabled = await ta2.evaluate((el) => el.disabled);
const isReadOnly = await ta2.evaluate((el) => el.readOnly);
check(!nativeDisabled && isReadOnly, 'phase 2: composer stays interactive while locked (readOnly, not disabled)');
await ta2.click({ force: true });
await page.waitForSelector('[role=dialog][aria-label="Unlock your keys"]', { timeout: 10000 });
check(true, 'phase 2: clicking the locked composer opens the unlock dialog');

await page.fill('input[aria-label="Account password"]', PASSWORD);
await page.click('[role=dialog] button:has-text("Unlock")');
await page.waitForSelector('text=Keys unlocked on this device', { timeout: 20000 });
log('unlocked from composer click');

/* ---- phase 3: typing works again, survives idle, sends ---- */
await ta2.click();
const T2 = 'The quick brown fox jumps over 1234567890 !@#';
await page.keyboard.type(T2, { delay: 5 });
check((await ta2.inputValue()) === T2, 'phase 3: typed text appears after unlock');
await page.waitForTimeout(6000);
const stillFocused = await page.evaluate(
  () => document.activeElement?.getAttribute('aria-label') === 'Message'
);
check(stillFocused, 'phase 3: composer keeps focus through 6s of socket idle');
check((await ta2.inputValue()) === T2, 'phase 3: draft survived the idle period');
await page.keyboard.press('Enter');
await page.waitForSelector(`text=${T2.slice(0, 20)}`, { timeout: 20000 });
check(true, 'phase 3: message sent + rendered');

await browser.close();
log(failures === 0 ? 'ALL TYPING CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
