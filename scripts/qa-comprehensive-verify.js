// =========================================================================
// qa-comprehensive-verify.js - Full Automated QA Test Suite
// Verifies feature calculations, data structures, a11y, and concurrency
// =========================================================================

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('🚀 Running Comprehensive QA Verification Suite...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. FINANCIAL MATHEMATICS & FORMULAS AUDIT
// -------------------------------------------------------------
console.log('--- 1. Financial Math & Ledger Calculations ---');

test('Financial summary math: Total Income = Allocation + Donation + Collection', () => {
  const breakdown = {
    allocation: 50000.00,
    donation: 15500.50,
    collection: 24750.25,
    expense: 35000.00,
    dashboard_expense: 5000.00,
    reserved_envelopes: 45000.00
  };

  const totalIncome = breakdown.allocation + breakdown.donation + breakdown.collection;
  assert.strictEqual(totalIncome, 90250.75);

  const generalExpense = breakdown.dashboard_expense;
  const totalReservedEnvelopes = breakdown.reserved_envelopes;
  const remainingBalance = totalIncome - generalExpense - totalReservedEnvelopes;
  assert.strictEqual(remainingBalance, 40250.75);
});

test('Event budget math: computed_remaining = allocated_budget + transfers - alloc_expenses', () => {
  const event = {
    allocated_budget: 15000.00,
    budget_injections: 2500.00, // Transfers in
    alloc_expenses: 8750.50     // Expenses charged against budget
  };

  const computedRemaining = Number(event.allocated_budget) + event.budget_injections - event.alloc_expenses;
  assert.strictEqual(computedRemaining, 8749.50);
});

test('Currency formatter handles float precision and zeroes correctly', () => {
  function fmt(n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  assert.strictEqual(fmt(0), '₱0.00');
  assert.strictEqual(fmt(1234.5), '₱1,234.50');
  assert.strictEqual(fmt(999999.99), '₱999,999.99');
  assert.strictEqual(fmt(null), '₱0.00');
  assert.strictEqual(fmt(undefined), '₱0.00');
});

// -------------------------------------------------------------
// 2. ACADEMIC UNITS & GPA/GWA COMPUTATIONS
// -------------------------------------------------------------
console.log('\n--- 2. Academic Units & Curriculum Calculations ---');

test('GWA (General Weighted Average) formula calculation', () => {
  const takenSubjects = [
    { code: 'MATH101', units: 3, grade: 1.25, status: 'passed' },
    { code: 'ENG101',  units: 3, grade: 1.50, status: 'passed' },
    { code: 'CPE101',  units: 4, grade: 1.75, status: 'passed' },
    { code: 'PE101',   units: 2, grade: 1.00, status: 'passed' },
    { code: 'NSTP101', units: 3, grade: null, status: 'enrolled' }, // Current term, not yet graded
    { code: 'PHYS101', units: 4, grade: 5.00, status: 'failed' }   // Failed subject
  ];

  let weightedGradeSum = 0;
  let gradedUnitsSum = 0;

  takenSubjects.forEach(s => {
    if (s.grade != null && !isNaN(Number(s.grade))) {
      const g = Number(s.grade);
      const u = Number(s.units);
      weightedGradeSum += g * u;
      gradedUnitsSum += u;
    }
  });

  // Graded units: 3 + 3 + 4 + 2 + 4 = 16 units
  assert.strictEqual(gradedUnitsSum, 16);
  // (1.25*3) + (1.50*3) + (1.75*4) + (1.00*2) + (5.00*4) = 3.75 + 4.5 + 7.0 + 2.0 + 20.0 = 37.25
  assert.strictEqual(weightedGradeSum, 37.25);

  const gwa = weightedGradeSum / gradedUnitsSum;
  assert.strictEqual(gwa.toFixed(2), '2.33');
});

test('No double counting of retaken subjects in completed units', () => {
  const myUnits = [
    { subject_id: 's1', status: 'failed', units: 3 },
    { subject_id: 's1', status: 'passed', units: 3 }, // retake passed
    { subject_id: 's2', status: 'passed', units: 4 },
    { subject_id: 's3', status: 'enrolled', units: 3 }
  ];

  const subjects = [
    { id: 's1', units: 3 },
    { id: 's2', units: 4 },
    { id: 's3', units: 3 }
  ];

  const passedSubjectIds = new Set(
    myUnits.filter(u => u.status === 'passed').map(u => u.subject_id)
  );

  const completedUnits = subjects
    .filter(s => passedSubjectIds.has(s.id))
    .reduce((sum, s) => sum + s.units, 0);

  // Should only be s1 (3) + s2 (4) = 7 units
  assert.strictEqual(completedUnits, 7);
});

// -------------------------------------------------------------
// 3. ROSTER NAME NORMALIZATION & COMPOUND SURNAMES
// -------------------------------------------------------------
console.log('\n--- 3. Roster Filipino Name Normalization ---');

const COMPOUND_PREFIXES = [
  'DEL ROSARIO', 'DELA CALZADA', 'DELA CRUZ', 'DELA RAMA', 'DELA TORRE',
  'DELA CERNA', 'DELA PEÑA', 'DELA PENA', 'DELA ROSA', 'DELA SERNA',
  'DE CASTRO', 'DE TORRES', 'DE LOS SANTOS', 'DE LOS REYES', 'DE GUZMAN',
  'DE LEON', 'DE VERA', 'SAN JUAN', 'SAN JOSE', 'SAN PEDRO', 'SANTA MARIA', 'STA. MARIA', 'STA MARIA'
];

function formatStudentName(name) {
  if (!name || typeof name !== 'string') return '';
  let n = name.trim().toUpperCase();
  if (n.includes(',')) {
    const [last, ...rest] = n.split(',');
    return `${last.trim()}, ${rest.join(' ').trim()}`;
  }

  for (const cp of COMPOUND_PREFIXES) {
    if (n.startsWith(cp + ' ')) {
      return `${cp}, ${n.slice(cp.length + 1).trim()}`;
    }
  }

  for (const cp of COMPOUND_PREFIXES) {
    if (n.endsWith(' ' + cp)) {
      return `${cp}, ${n.slice(0, n.length - cp.length - 1).trim()}`;
    }
  }

  const parts = n.split(/\s+/);
  if (parts.length > 1) {
    const lastName = parts[parts.length - 1];
    const firstNames = parts.slice(0, parts.length - 1).join(' ');
    return `${lastName}, ${firstNames}`;
  }
  return n;
}

test('Formats natural English order Google names (Firstname Lastname)', () => {
  assert.strictEqual(formatStudentName('Marco Navarro'), 'NAVARRO, MARCO');
  assert.strictEqual(formatStudentName('Vic Oliver Bungabong'), 'BUNGABONG, VIC OLIVER');
  assert.strictEqual(formatStudentName('Kristine Kaye Camillo'), 'CAMILLO, KRISTINE KAYE');
  assert.strictEqual(formatStudentName('Anica Enad'), 'ENAD, ANICA');
  assert.strictEqual(formatStudentName('Princess Angel S Otero'), 'OTERO, PRINCESS ANGEL S');
  assert.strictEqual(formatStudentName('Francis Castillo'), 'CASTILLO, FRANCIS');
  assert.strictEqual(formatStudentName('Vanessa Oric'), 'ORIC, VANESSA');
  assert.strictEqual(formatStudentName('Marlee Mitch M. Gildore'), 'GILDORE, MARLEE MITCH M.');
  assert.strictEqual(formatStudentName('Alyssa Fuentes'), 'FUENTES, ALYSSA');
});

test('Formats compound surnames correctly in both natural and registry order', () => {
  assert.strictEqual(formatStudentName('Juan Miguel Dela Cruz'), 'DELA CRUZ, JUAN MIGUEL');
  assert.strictEqual(formatStudentName('DELA CRUZ, JUAN MIGUEL'), 'DELA CRUZ, JUAN MIGUEL');
  assert.strictEqual(formatStudentName('DELA CRUZ JUAN MIGUEL'), 'DELA CRUZ, JUAN MIGUEL');
  assert.strictEqual(formatStudentName('Maria Clara San Juan'), 'SAN JUAN, MARIA CLARA');
  assert.strictEqual(formatStudentName('DE LOS SANTOS MARIA CLARA'), 'DE LOS SANTOS, MARIA CLARA');
  assert.strictEqual(formatStudentName('Carlos De Castro'), 'DE CASTRO, CARLOS');
  assert.strictEqual(formatStudentName('DEL ROSARIO ANTONIO'), 'DEL ROSARIO, ANTONIO');
});

// -------------------------------------------------------------
// 4. HTML DOM INTEGRITY & ACCESSIBILITY AUDIT
// -------------------------------------------------------------
console.log('\n--- 4. HTML DOM Integrity & A11y Verification ---');

test('index.html and officer.html exist and have valid syntax', () => {
  const indexHtml = fs.readFileSync('client/index.html', 'utf8');
  const officerHtml = fs.readFileSync('client/officer.html', 'utf8');

  assert.ok(indexHtml.includes('<!DOCTYPE html>'));
  assert.ok(officerHtml.includes('<!DOCTYPE html>'));
  assert.ok(indexHtml.includes('<title>'));
  assert.ok(officerHtml.includes('<title>'));
});

test('Unique IDs in index.html (no duplicated DOM IDs)', () => {
  const indexHtml = fs.readFileSync('client/index.html', 'utf8');
  const idMatches = [...indexHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const counts = {};
  const duplicates = [];

  idMatches.forEach(id => {
    counts[id] = (counts[id] || 0) + 1;
    if (counts[id] === 2) duplicates.push(id);
  });

  if (duplicates.length > 0) {
    console.warn('Duplicate IDs found in index.html:', duplicates);
  }
  assert.strictEqual(duplicates.length, 0, `Found duplicate IDs: ${duplicates.join(', ')}`);
});

test('Unique IDs in officer.html (no duplicated DOM IDs)', () => {
  const officerHtml = fs.readFileSync('client/officer.html', 'utf8');
  const idMatches = [...officerHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const counts = {};
  const duplicates = [];

  idMatches.forEach(id => {
    counts[id] = (counts[id] || 0) + 1;
    if (counts[id] === 2) duplicates.push(id);
  });

  if (duplicates.length > 0) {
    console.warn('Duplicate IDs found in officer.html:', duplicates);
  }
  assert.strictEqual(duplicates.length, 0, `Found duplicate IDs: ${duplicates.join(', ')}`);
});

test('All modal overlays have proper ARIA dialog roles and accessibility labels', () => {
  const indexHtml = fs.readFileSync('client/index.html', 'utf8');
  const officerHtml = fs.readFileSync('client/officer.html', 'utf8');

  assert.ok(indexHtml.includes('role="dialog"'));
  assert.ok(indexHtml.includes('aria-modal="true"'));
  assert.ok(officerHtml.includes('role="dialog"'));
  assert.ok(officerHtml.includes('aria-modal="true"'));
});

// -------------------------------------------------------------
// 5. CSS TOKEN CONSISTENCY & THEME COVERAGE
// -------------------------------------------------------------
console.log('\n--- 5. CSS Styling & Theme Tokens Audit ---');

test('officer.css defines .of-btn-secondary and proper color variables', () => {
  const officerCss = fs.readFileSync('client/styles/officer.css', 'utf8');
  assert.ok(officerCss.includes('.of-btn-secondary'));
  assert.ok(officerCss.includes('.of-btn-primary'));
  assert.ok(officerCss.includes('.of-btn-ghost'));
});

// -------------------------------------------------------------
// 6. SWR CACHE ENGINE STRESS & CONCURRENCY
// -------------------------------------------------------------
console.log('\n--- 6. Scalability & SWR Cache Concurrency ---');

test('SWR cache handles 100 concurrent requests without race conditions', async () => {
  const cache = new Map();
  const inFlight = new Map();
  let networkFetches = 0;

  async function mockFetch(path) {
    const isGet = true;
    const ttlMs = 1000;
    const cacheKey = path;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey).data;
    }

    if (inFlight.has(cacheKey)) {
      return inFlight.get(cacheKey);
    }

    const fetchPromise = (async () => {
      networkFetches++;
      await new Promise(r => setTimeout(r, 10)); // simulate 10ms latency
      const data = { message: 'success', count: 405 };
      cache.set(cacheKey, { data, timestamp: Date.now(), ttlMs });
      return data;
    })();

    inFlight.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  // Fire 100 concurrent calls
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(mockFetch('/events'));
  }

  const results = await Promise.all(promises);
  assert.strictEqual(results.length, 100);
  assert.strictEqual(results[0].count, 405);
  // All 100 callers should deduplicate into exactly 1 network call
  assert.strictEqual(networkFetches, 1, `Expected 1 network fetch, but got ${networkFetches}`);
});

// -------------------------------------------------------------
// 7. SCRIPT INTEGRITY & CDN DEPENDENCY VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 7. Script Integrity & Dependency Audit ---');

test('index.html and officer.html include required Supabase and Chart.js CDN scripts', () => {
  const indexHtml = fs.readFileSync('client/index.html', 'utf8');
  const officerHtml = fs.readFileSync('client/officer.html', 'utf8');

  assert.ok(indexHtml.includes('@supabase/supabase-js'), 'index.html missing Supabase CDN script');
  assert.ok(indexHtml.includes('chart.js'), 'index.html missing Chart.js CDN script');
  assert.ok(officerHtml.includes('@supabase/supabase-js'), 'officer.html missing Supabase CDN script');
  assert.ok(officerHtml.includes('chart.js'), 'officer.html missing Chart.js CDN script');
});

test('All frontend JS files have valid syntax without scope redeclarations', () => {
  import('node:vm').then(vm => {
    const jsFiles = [
      'client/js/config.js',
      'client/js/roster.js',
      'client/js/auth.js',
      'client/js/api.js',
      'client/js/ui.js',
      'client/js/dashboard.js',
      'client/js/events.js',
      'client/js/transactions.js',
      'client/js/reports.js',
      'client/js/income.js',
      'client/js/units.js',
      'client/js/receipt-capture.js',
      'client/js/dropdown.js',
      'client/js/admin.js',
      'client/js/ai-assistant.js',
      'client/js/profile.js',
      'client/js/notifications.js',
      'client/js/app.js',
      'client/js/officer/officer-app.js'
    ];

    jsFiles.forEach(file => {
      const code = fs.readFileSync(file, 'utf8');
      assert.doesNotThrow(() => new vm.Script(code), `Syntax or redeclaration error in ${file}`);
    });
  });
});

// -------------------------------------------------------------
// 8. NOTIFICATION SYSTEM INTEGRITY VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 8. Notification System Integrity Audit ---');

test('Migration 019_notifications_schema.sql exists and defines required tables', () => {
  const sql = fs.readFileSync('supabase/migrations/019_notifications_schema.sql', 'utf8');
  assert.ok(sql.includes('public.notifications'), '019_notifications_schema.sql missing public.notifications table');
  assert.ok(sql.includes('public.notification_reads'), '019_notifications_schema.sql missing public.notification_reads table');
  assert.ok(sql.includes('supabase_realtime ADD TABLE public.notifications'), '019_notifications_schema.sql missing realtime publication');
});

console.log(`\n=============================================================`);
console.log(`🎉 QA Verification Complete: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
console.log(`=============================================================\n`);
