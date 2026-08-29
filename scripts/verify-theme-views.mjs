import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\174a8ed2-ab0b-4f80-86df-8806cf36523f';
const SITE_URL = 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to', SITE_URL);
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });

  // 1. Capture Auth Screen in Default Mode
  console.log('Capturing Auth Screen (Default Dark)...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_auth_screen_dark.png') });

  // 2. Set data-theme="light" on html and check Auth Screen to verify it STAYS DARK
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.waitForTimeout(300);
  console.log('Capturing Auth Screen with data-theme="light" (Must stay dark)...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_auth_screen_remains_dark.png') });

  // 3. Switch to App Screen (simulate authenticated state / view toggle)
  await page.evaluate(() => {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    // Ensure dashboard view is active
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-dashboard').classList.add('active');
    document.documentElement.setAttribute('data-theme', 'light');
    if (window.ThemeManager) window.ThemeManager.updateUI();
  });
  await page.waitForTimeout(500);

  console.log('Capturing Dashboard in Light Mode...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_dashboard_light.png') });

  // 4. Financial Ledger in Light Mode
  await page.evaluate(() => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-transactions').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector('.nav-item[data-view="transactions"]');
    if (nav) nav.classList.add('active');
  });
  await page.waitForTimeout(500);
  console.log('Capturing Financial Ledger in Light Mode...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_ledger_light.png') });

  // 5. Credit Unit Tracker in Light Mode
  await page.evaluate(() => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-units').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector('.nav-item[data-view="units"]');
    if (nav) nav.classList.add('active');
  });
  await page.waitForTimeout(500);
  console.log('Capturing Credit Unit Tracker in Light Mode...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_units_tracker_light.png') });

  // 6. Open Profile Modal in Light Mode
  await page.evaluate(() => {
    const modal = document.getElementById('profile-modal');
    const overlay = document.getElementById('profile-modal-overlay');
    if (modal) modal.classList.remove('hidden');
    if (overlay) overlay.classList.remove('hidden');
  });
  await page.waitForTimeout(400);
  console.log('Capturing Profile Modal in Light Mode...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_profile_modal_light.png') });

  // Close profile modal
  await page.evaluate(() => {
    const modal = document.getElementById('profile-modal');
    const overlay = document.getElementById('profile-modal-overlay');
    if (modal) modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
  });

  // 7. Open AI Assistant / Grizz Drawer in Light Mode
  await page.evaluate(() => {
    const drawer = document.getElementById('ursa-drawer');
    const overlay = document.getElementById('ursa-overlay');
    if (drawer) drawer.classList.add('active');
    if (overlay) overlay.classList.add('active');
  });
  await page.waitForTimeout(500);
  console.log('Capturing AI Assistant Drawer in Light Mode...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_ai_assistant_light.png') });

  // Close AI drawer and toggle back to Dark Mode
  await page.evaluate(() => {
    const drawer = document.getElementById('ursa-drawer');
    const overlay = document.getElementById('ursa-overlay');
    if (drawer) drawer.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-dashboard').classList.add('active');
    document.documentElement.setAttribute('data-theme', 'dark');
    if (window.ThemeManager) window.ThemeManager.updateUI();
  });
  await page.waitForTimeout(500);
  console.log('Capturing Dashboard in Dark Mode (Confirming Zero Regressions)...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_dashboard_dark_preserved.png') });

  await browser.close();
  console.log('All screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
