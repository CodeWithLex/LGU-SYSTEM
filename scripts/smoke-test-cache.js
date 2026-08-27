// =============================================
// scripts/smoke-test-cache.js
// Tests the SWR (Stale-While-Revalidate) caching, deduplication,
// targeted invalidation, and prefetch mechanisms in client/js/api.js
// =============================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'client', 'js', 'api.js'), 'utf8');

// Set up a mock browser environment in VM
let fetchLog = [];
let dispatchedEvents = [];

const mockFetch = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  fetchLog.push({ url, method, body: opts.body });

  // Simulate network delay
  await new Promise(r => setTimeout(r, 10));

  if (url.includes('/api/events')) {
    return { ok: true, status: 200, json: async () => [{ id: 'ev-1', event_name: 'Tech Day' }] };
  }
  if (url.includes('/api/transactions')) {
    return { ok: true, status: 200, json: async () => [{ id: 'tx-1', amount: 500 }] };
  }
  if (url.includes('/api/reports/summary')) {
    return { ok: true, status: 200, json: async () => ({ totalIncome: 1000, totalExpense: 500, remainingBalance: 500 }) };
  }
  if (url.includes('/api/reports/monthly')) {
    return { ok: true, status: 200, json: async () => [] };
  }
  if (url.includes('/api/reports/events-summary')) {
    return { ok: true, status: 200, json: async () => [] };
  }
  if (url.includes('/api/units/checklists')) {
    return { ok: true, status: 200, json: async () => ({ requirements: [], subjects: [] }) };
  }
  if (url.includes('/api/units/my')) {
    return { ok: true, status: 200, json: async () => [] };
  }
  if (url.includes('/api/admin/users')) {
    return { ok: true, status: 200, json: async () => [{ id: 'u-1', email: 'admin@cjc.edu.ph' }] };
  }
  if (url.includes('/api/admin/audit-logs')) {
    return { ok: true, status: 200, json: async () => [] };
  }

  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

const sandbox = {
  window: {
    API_BASE: '',
    supabaseClient: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'mock-token' } } }),
        signOut: () => {},
      }
    }
  },
  document: {
    dispatchEvent: (evt) => { dispatchedEvents.push(evt); }
  },
  CustomEvent: class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  },
  fetch: mockFetch,
  console: {
    log: console.log,
    warn: console.warn,
    debug: console.debug,
    error: console.error,
  },
  URLSearchParams: require('url').URLSearchParams,
  setTimeout: setTimeout,
  Date: Date,
  Map: Map,
  JSON: JSON,
  Promise: Promise,
};

vm.createContext(sandbox);
vm.runInContext(apiSource, sandbox);

const Api = vm.runInContext('Api', sandbox);

let failed = 0;
function assert(desc, condition) {
  if (condition) {
    console.log(`PASS ${desc}`);
  } else {
    console.error(`FAIL ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- Testing SWR Cache Engine ---');

  // Test 1: Fresh GET hits cache on second call
  fetchLog = [];
  const events1 = await Api.events.list();
  assert('First Api.events.list() fetches from network', fetchLog.length === 1);
  assert('Api.hasCache("/events") is true after fetch', Api.hasCache('/events'));

  const events2 = await Api.events.list();
  assert('Second Api.events.list() within TTL uses cache (no new fetch)', fetchLog.length === 1);
  assert('Returned data matches', events1[0].event_name === events2[0].event_name);

  // Test 2: In-flight deduplication
  fetchLog = [];
  Api.invalidateCache('/reports/summary');
  const [rep1, rep2] = await Promise.all([
    Api.reports.summary(),
    Api.reports.summary(),
  ]);
  assert('Concurrent requests deduplicated into single network fetch', fetchLog.length === 1);
  assert('Both callers received same summary data', rep1.remainingBalance === rep2.remainingBalance);

  // Test 3: Targeted invalidation
  fetchLog = [];
  Api.invalidateCache('/events');
  assert('Api.hasCache("/events") is false after invalidateCache("/events")', !Api.hasCache('/events'));
  assert('Api.hasCache("/reports/summary") remains intact', Api.hasCache('/reports/summary'));

  // Test 4: Mutating action auto-invalidates target caches
  fetchLog = [];
  await Api.events.create({ event_name: 'New Event' });
  assert('Mutating call invalidates /events cache', !Api.hasCache('/events'));
  assert('Mutating call invalidates /reports cache', !Api.hasCache('/reports/summary'));

  // Test 5: PrefetchAll works for student role
  fetchLog = [];
  Api.invalidateCache();
  await Api.prefetchAll('student', 'BSCoE');
  assert('Api.prefetchAll fetches events, transactions, reports, units', fetchLog.length >= 6);
  assert('Cache now contains /events', Api.hasCache('/events'));
  assert('Cache now contains /reports/summary', Api.hasCache('/reports/summary'));
  assert('Cache now contains /units/my', Api.hasCache('/units/my'));
  assert('Cache now contains /units/checklists?program=BSCoE', Api.hasCache('/units/checklists?program=BSCoE'));
  assert('Admin users NOT pre-fetched for student', !Api.hasCache('/admin/users'));

  // Test 6: PrefetchAll for admin includes admin endpoints
  fetchLog = [];
  Api.invalidateCache();
  await Api.prefetchAll('admin', 'BSCoE');
  assert('Admin users pre-fetched for admin role', Api.hasCache('/admin/users'));
  assert('Admin audit-logs pre-fetched for admin role', Api.hasCache('/admin/audit-logs?limit=100'));

  console.log('\n--------------------------------');
  if (failed > 0) {
    console.error(`\n${failed} test(s) FAILED`);
    process.exit(1);
  } else {
    console.log('\nAll SWR Cache tests PASSED successfully.');
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
