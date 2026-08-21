// =============================================
// smoke-ui.mjs — post-deploy UI gate
//
// The unauthenticated block catches the exact failure class that broke
// login for every user on 2026-08-22: a page-load JS crash (an empty
// <select> killed app.js's startup wiring, leaving the login button
// dead). The authenticated block (optional) walks the main views.
//
// Run locally:  node scripts/smoke-ui.mjs
//   (first time: npm install && npx playwright install chromium)
// Optional:     TEST_EMAIL=… TEST_PASSWORD=… node scripts/smoke-ui.mjs
// Env:          SITE_URL (default: production)
// =============================================
import { chromium } from 'playwright';

const SITE = process.env.SITE_URL || 'https://www.coelgu-system.engineer';
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

let failures = 0;
const fail = (msg) => { failures++; console.log(`FAIL ${msg}`); };
const pass = (msg) => console.log(`PASS ${msg}`);

const browser = await chromium.launch();
const page = await browser.newPage();

let consoleErrors = [];
let pageErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));

// ---- Gate 1: page loads with zero JS errors ----
await page.goto(SITE, { waitUntil: 'networkidle', timeout: 45000 });

if (pageErrors.length) fail(`page errors on load (${pageErrors.length}): ${pageErrors[0].slice(0, 160)}`);
else pass('no page errors on load');

if (consoleErrors.length) fail(`console errors on load (${consoleErrors.length}): ${consoleErrors[0].slice(0, 160)}`);
else pass('no console errors on load');

// ---- Gate 2: the login form is actually wired ----
// Dummy credentials must produce SOME feedback (error box or toast).
// A dead submit button means startup JS crashed — the whole app is down.
await page.fill('#login-email', 'smoke@test.invalid');
await page.fill('#login-password', 'wrong-password');
await page.click('#login-btn');

let feedback = false;
try {
  await page.waitForSelector('#login-error:not(.hidden)', { timeout: 8000 });
  feedback = true;
} catch {
  try {
    await page.waitForSelector('[class*="toast"]', { timeout: 3000 });
    feedback = true;
  } catch { /* both selectors missed */ }
}
if (feedback) pass('login form is wired (submit produced feedback)');
else fail('login submit produced NO feedback — app startup JS is likely dead');

// ---- Gate 3 (optional): authenticated walk-through ----
if (TEST_EMAIL && TEST_PASSWORD) {
  consoleErrors = [];
  pageErrors = [];

  await page.fill('#login-email', TEST_EMAIL);
  await page.fill('#login-password', TEST_PASSWORD);
  await page.click('#login-btn');

  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('app-screen');
        return el && getComputedStyle(el).display !== 'none';
      },
      { timeout: 20000 }
    );
    pass('login succeeded, app screen visible');
  } catch (err) {
    fail(`login with test account failed: ${err.message}`);
  }

  const views = ['dashboard', 'events', 'transactions', 'reports', 'units'];
  for (const view of views) {
    const link = page.locator(`.nav-item[data-view="${view}"]`);
    if (!(await link.count())) { fail(`nav item missing for view "${view}"`); continue; }
    await link.click();
    await page.waitForTimeout(1500);
    if (pageErrors.length) fail(`page error after opening "${view}": ${pageErrors[0].slice(0, 160)}`);
    else pass(`view "${view}" opened without page errors`);
  }

  // The academic progress view must actually render its content.
  const progressCard = await page.locator('#units-progress-card').count();
  if (progressCard) pass('academic progress view rendered');
  else fail('academic progress view did not render #units-progress-card');
} else {
  console.log('SKIP authenticated checks (set TEST_EMAIL and TEST_PASSWORD to enable)');
}

await browser.close();

if (failures) {
  console.error(`\n${failures} smoke check(s) FAILED — do not trust this deployment.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
