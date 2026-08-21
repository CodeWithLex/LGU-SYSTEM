const fs = require('fs');
const path = require('path');

const extractPath = 'C:\\Users\\User\\AppData\\Local\\Temp\\docx-extract\\word\\media';
const assetsPath = 'c:\\Users\\User\\Documents\\LGU System\\client\\assets';

function compareAndCopy(srcName, destName) {
  const srcPath = path.join(extractPath, srcName);
  if (!fs.existsSync(srcPath)) {
    console.log(`Src not found: ${srcName}`);
    return;
  }
  const destPath = path.join(assetsPath, destName);
  
  const srcSize = fs.statSync(srcPath).size;
  console.log(`Source File: ${srcName}, Size: ${srcSize} bytes`);

  if (fs.existsSync(destPath)) {
    const destSize = fs.statSync(destPath).size;
    console.log(`Dest File ${destName} exists, Size: ${destSize} bytes`);
    if (srcSize === destSize) {
      console.log(`File matches exactly!`);
    } else {
      console.log(`File sizes mismatch.`);
    }
  } else {
    console.log(`Dest file does not exist, copying...`);
  }
  // Copy it for safety so we can see it or reference it
  fs.copyFileSync(srcPath, path.join(assetsPath, 'temp_' + srcName));
  console.log(`Copied ${srcName} to temp_${srcName}`);
}

compareAndCopy('image1.jpg', 'letterhead-banner.jpg');
compareAndCopy('image5.png', 'coe-logo.png');
compareAndCopy('image5.png', 'coe-school-seal.png');
