// Smoke test for the enrollment optional-detail fields: extracts
// sanitizeOptionalText from the live route source (same vm pattern as
// smoke-test-standing.js) and verifies trim / 120-char cap / empty→null,
// plus static wiring checks that /my, /enroll, and /update carry the
// fields. Run: node scripts/smoke-test-units-fields.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server', 'routes', 'units.js'), 'utf8');

// Brace-matched extraction of a top-level function from the source.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found in route source`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`Unterminated function ${name}`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractFn(source, 'sanitizeOptionalText'), sandbox);

let failed = 0;

const cases = [
  [null, null],
  [undefined, null],
  ['', null],
  ['   ', null],
  ['  MWF 9:00–10:00  ', 'MWF 9:00–10:00'],
  ['Engr. Cruz', 'Engr. Cruz'],
  ['x'.repeat(200), 'x'.repeat(120)],
];
for (const [input, expected] of cases) {
  const got = sandbox.sanitizeOptionalText(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} sanitizeOptionalText(${JSON.stringify(input ?? null).slice(0, 32)}) -> ${JSON.stringify(got)}`);
}

// Static wiring checks — the SELECT and writes must carry the fields.
const wiring = [
  ['instructor, schedule, subjects(id, code, title, units', '/my SELECT includes instructor + schedule'],
  ['instructor: sanitizeOptionalText(instructor)', '/enroll insert sanitizes instructor'],
  ['schedule: sanitizeOptionalText(schedule)', '/enroll insert sanitizes schedule'],
  ['updates.instructor = sanitizeOptionalText(instructor)', '/update maps instructor'],
  ['updates.schedule = sanitizeOptionalText(schedule)', '/update maps schedule'],
];
for (const [needle, label] of wiring) {
  const ok = source.includes(needle);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

if (failed) { console.error(`\n${failed} check(s) FAILED`); process.exit(1); }
console.log('\nAll checks passed.');
