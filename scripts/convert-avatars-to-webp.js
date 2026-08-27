const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const avatarsRoot = path.join(__dirname, '..', 'client', 'assets', 'avatars');
const categories = ['grizz', 'icebear', 'panda', 'others'];

async function convertAll() {
  let totalOldBytes = 0;
  let totalNewBytes = 0;

  for (const cat of categories) {
    const dir = path.join(avatarsRoot, cat);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));

    for (const file of files) {
      const srcPath = path.join(dir, file);
      const baseName = path.parse(file).name;
      const destPath = path.join(dir, `${baseName}.webp`);

      const oldStats = fs.statSync(srcPath);
      totalOldBytes += oldStats.size;

      await sharp(srcPath)
        .resize(160, 160, { fit: 'cover', position: 'center' })
        .webp({ quality: 85, effort: 6 })
        .toFile(destPath);

      const newStats = fs.statSync(destPath);
      totalNewBytes += newStats.size;

      // Remove the old uncompressed jpg
      fs.unlinkSync(srcPath);

      console.log(`Converted ${cat}/${file} (${(oldStats.size / 1024).toFixed(1)} KB) -> ${baseName}.webp (${(newStats.size / 1024).toFixed(1)} KB)`);
    }
  }

  console.log(`\nTotal Old Size: ${(totalOldBytes / 1024).toFixed(1)} KB`);
  console.log(`Total Optimized WebP Size: ${(totalNewBytes / 1024).toFixed(1)} KB`);
  console.log(`Bandwidth Saved: ${(((totalOldBytes - totalNewBytes) / totalOldBytes) * 100).toFixed(1)}% reduction!`);
}

convertAll().catch(err => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
