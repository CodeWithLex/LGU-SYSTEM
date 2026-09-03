// =============================================
// build-deck.mjs
// Builds COE-System-Presentation.html from deck-template.html,
// embedding system screenshots as base64 data URIs so the deck
// stays a single, offline-safe file.
//
// Usage: node presentation/build-deck.mjs
// =============================================
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, 'shots');
const OUT = path.join(__dirname, 'COE-System-Presentation.html');

async function jpeg(name, width, { crop = null, quality = 84 } = {}) {
  let img = sharp(path.join(SHOTS, `${name}.png`));
  if (crop) img = img.extract(crop);
  const buf = await img.resize(width).jpeg({ quality, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function png(name) {
  const buf = await fs.promises.readFile(path.join(SHOTS, `${name}.png`));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function main() {
  // Grizz chat panel: crop the right-side drawer from the full screenshot
  const grizzCrop = { left: 1880, top: 0, width: 1000, height: 1800 };

  const images = {
    dashboard: await jpeg('dashboard', 1360),
    login: await jpeg('login', 1200),
    events: await jpeg('events', 1360),
    grizzanswer: await jpeg('grizz-answer', 760, { crop: grizzCrop, quality: 88 }),
    // Real receipt modal screenshot provided by the owner
    receipt: await jpeg('receipt-real', 843, { quality: 90 }),
    grizz: await png('grizz-mascot'),
  };

  let html = fs.readFileSync(path.join(__dirname, 'deck-template.html'), 'utf8');
  for (const [name, uri] of Object.entries(images)) {
    html = html.replaceAll(`{{IMG:${name}}}`, uri);
  }

  if (/{{IMG:/.test(html)) throw new Error('Unresolved image tokens remain in template');

  fs.writeFileSync(OUT, html);
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log(`Built ${OUT} (${mb} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
