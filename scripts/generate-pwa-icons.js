// Generates PWA icons from the COE logo into client/assets/icons/.
// Run once with: node scripts/generate-pwa-icons.js
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'client', 'assets', 'coe-logo.png');
const OUT = path.join(__dirname, '..', 'client', 'assets', 'icons');
// --surface of the dark theme (#111820) — brand-matching launcher background
const BRAND_BG = { r: 17, g: 24, b: 32, alpha: 1 };

async function centeredOnBg(size, inner, file) {
  const logo = await sharp(SRC).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BRAND_BG } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(path.join(OUT, file));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // "any" icons keep the logo's own transparent background
  for (const size of [192, 512]) {
    await sharp(SRC).resize(size, size).png().toFile(path.join(OUT, `icon-${size}.png`));
  }

  // Maskable icons need full-bleed color with the logo inside the safe zone
  for (const size of [192, 512]) {
    await centeredOnBg(size, Math.round(size * 0.72), `icon-maskable-${size}.png`);
  }

  // iOS home-screen icon (iOS applies its own corner mask)
  await centeredOnBg(180, Math.round(180 * 0.8), 'apple-touch-icon.png');

  console.log('PWA icons written to', OUT);
})().catch((err) => { console.error(err); process.exit(1); });
