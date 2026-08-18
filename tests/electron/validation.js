// Simple validation test for Electron app structure
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '../../electron');
const tests = [];

function testExists(filePath, description) {
  const exists = fs.existsSync(filePath);
  tests.push({ description, passed: exists, file: filePath });
  return exists;
}

function testContainsFileContent(filePath, content, description) {
  if (!fs.existsSync(filePath)) {
    tests.push({ description: `${description} - File missing`, passed: false });
    return false;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const contains = fileContent.includes(content);
  tests.push({ description, passed: contains });
  return contains;
}

console.log('Running Electron app validation tests...\n');

// Test 1: Check required files exist
testExists(path.join(electronDir, 'package.json'), 'package.json exists');
testExists(path.join(electronDir, 'main.js'), 'main.js exists');
testExists(path.join(electronDir, 'preload.js'), 'preload.js exists');
testExists(path.join(electronDir, 'README.md'), 'README.md exists');
testExists(path.join(electronDir, 'menu.js'), 'menu.js exists');

// Test 2: Check package.json has required fields
if (fs.existsSync(path.join(electronDir, 'package.json'))) {
  const pkg = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'));
  tests.push({
    description: 'package.json has name field',
    passed: !!pkg.name
  });
  tests.push({
    description: 'package.json has main field',
    passed: !!pkg.main
  });
  tests.push({
    description: 'package.json has build config',
    passed: !!pkg.build
  });
  tests.push({
    description: 'package.json has devDependencies',
    passed: !!pkg.devDependencies && !!pkg.devDependencies.electron
  });
}

// Test 3: Check main.js has required imports and functions
testContainsFileContent(
  path.join(electronDir, 'main.js'),
  'BrowserWindow',
  'main.js imports BrowserWindow'
);
testContainsFileContent(
  path.join(electronDir, 'main.js'),
  'createWindow',
  'main.js has createWindow function'
);
testContainsFileContent(
  path.join(electronDir, 'main.js'),
  'Tray',
  'main.js imports Tray for system tray'
);
testContainsFileContent(
  path.join(electronDir, 'main.js'),
  'Menu',
  'main.js imports Menu for native menus'
);

// Test 4: Check preload.js has security features
testContainsFileContent(
  path.join(electronDir, 'preload.js'),
  'contextBridge',
  'preload.js uses contextBridge'
);
testContainsFileContent(
  path.join(electronDir, 'main.js'),
  'contextIsolation',
  'main.js configures context isolation'
);

// Test 5: Check client integration
testContainsFileContent(
  path.join(__dirname, '../../client/js/config.js'),
  'IS_ELECTRON',
  'config.js detects Electron environment'
);
testContainsFileContent(
  path.join(__dirname, '../../client/js/config.js'),
  'API_BASE',
  'config.js defines API_BASE'
);

// Print results
console.log('\nTest Results:');
console.log('=============');
let passed = 0;
let failed = 0;

tests.forEach(test => {
  const status = test.passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${test.description}`);
  if (test.passed) passed++; else failed++;
});

console.log('\nSummary:');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${tests.length}`);

if (failed === 0) {
  console.log('\n✓ All tests passed! Electron app structure is valid.');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed. Please review the issues above.');
  process.exit(1);
}
