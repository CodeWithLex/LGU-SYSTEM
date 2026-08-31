// =============================================
// api.js - API Helper Module with SWR Pre-Caching
// =============================================

const Api = (() => {

  async function _getToken() {
    if (!window.supabaseClient?.auth) return null;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session?.access_token || null;
  }

  // Cache Map stores: key -> { data, timestamp, ttlMs }
  const _cache = new Map();
  // In-flight Promise Map to deduplicate concurrent requests
  const _inFlight = new Map();

  function invalidateCache(...prefixes) {
    if (prefixes.length === 0 || (prefixes.length === 1 && !prefixes[0])) {
      _cache.clear();
      return;
    }
    const flat = prefixes.flat().filter(Boolean);
    for (const key of _cache.keys()) {
      if (flat.some(p => key.startsWith(p) || key.includes(p))) {
        _cache.delete(key);
      }
    }
  }

  function hasCache(path) {
    return _cache.has(path);
  }

  function getCache(path) {
    const entry = _cache.get(path);
    return entry ? JSON.parse(JSON.stringify(entry.data)) : null;
  }

  async function _fetchRaw(method, path, body = null, isFormData = false) {
    const token = await _getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(`${window.API_BASE}/api${path}`, opts);

    if (res.status === 401) {
      if (window.supabaseClient?.auth) window.supabaseClient.auth.signOut();
      throw new Error('Invalid or expired session token. Please log in again.');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  async function _request(method, path, body = null, isFormData = false, ttlMs = 0) {
    const isGet = method.toUpperCase() === 'GET';
    const cacheKey = `${path}`;

    // 1. SWR Cache check for GET requests
    if (isGet && ttlMs > 0 && _cache.has(cacheKey)) {
      const entry = _cache.get(cacheKey);
      const isFresh = (Date.now() - entry.timestamp) < ttlMs;

      if (isFresh) {
        // Return fresh cached copy immediately
        return JSON.parse(JSON.stringify(entry.data));
      }

      // Stale cache hit: return cached data immediately, then revalidate in background
      if (!_inFlight.has(cacheKey)) {
        const bgFetch = (async () => {
          try {
            const freshData = await _fetchRaw('GET', path);
            _cache.set(cacheKey, { data: freshData, timestamp: Date.now(), ttlMs });
            // Notify active listeners that fresh data arrived in background
            document.dispatchEvent(new CustomEvent('api:cache-updated', { detail: { path, data: freshData } }));
          } catch (err) {
            // Silently ignore background revalidation errors so user keeps stale UI
            console.debug('[SWR] Background revalidation failed for', path, err?.message);
          } finally {
            _inFlight.delete(cacheKey);
          }
        })();
        _inFlight.set(cacheKey, bgFetch);
      }

      return JSON.parse(JSON.stringify(entry.data));
    }

    // 2. Deduplicate in-flight GET requests
    if (isGet && _inFlight.has(cacheKey)) {
      return _inFlight.get(cacheKey);
    }

    // 3. Perform network request
    const fetchPromise = (async () => {
      try {
        const data = await _fetchRaw(method, path, body, isFormData);

        if (isGet && ttlMs > 0) {
          _cache.set(cacheKey, { data, timestamp: Date.now(), ttlMs });
        } else if (!isGet) {
          // Mutating calls invalidate caches based on target route
          if (path.startsWith('/events')) {
            invalidateCache('/events', '/reports', '/dashboard');
          } else if (path.startsWith('/transactions')) {
            invalidateCache('/transactions', '/reports', '/dashboard', '/income');
          } else if (path.startsWith('/admin')) {
            invalidateCache('/admin', '/reports', '/transactions', '/dashboard');
          } else if (path.startsWith('/units')) {
            invalidateCache('/units/my');
          } else {
            invalidateCache();
          }
        }

        return data;
      } finally {
        if (isGet) _inFlight.delete(cacheKey);
      }
    })();

    if (isGet) _inFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  // ---- Endpoints with Calibrated SWR TTLs ----
  const events = {
    list:    ()       => _request('GET', '/events', null, false, 60000),
    get:     (id)     => _request('GET', `/events/${id}`, null, false, 60000),
    create:  (body)   => _request('POST', '/events', body),
    update:  (id, b)  => _request('PATCH', `/events/${id}`, b),
    archive: (id)     => _request('PATCH', `/admin/events/${id}/archive`),
  };

  const transactions = {
    list:   (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return _request('GET', `/transactions${q ? '?' + q : ''}`, null, false, 30000);
    },
    create: (body)        => _request('POST',   '/transactions', body, body instanceof FormData),
    bulkCreate: (body)    => _request('POST',   '/transactions/bulk', { transactions: body }),
    update: (id, body)    => _request('PATCH',  `/transactions/${id}`, body),
    remove: (id, body)    => _request('DELETE', `/transactions/${id}`, body),
  };

  const reports = {
    summary:       () => _request('GET', '/reports/summary', null, false, 45000),
    monthly:       () => _request('GET', '/reports/monthly', null, false, 45000),
    eventsSummary: () => _request('GET', '/reports/events-summary', null, false, 45000),
  };

  const admin = {
    users:          ()         => _request('GET',   '/admin/users', null, false, 30000),
    setRole:        (id, role) => _request('PATCH', `/admin/users/${id}/role`, { role }),
    auditLogs:      (params={})=> {
      const q = new URLSearchParams(params).toString();
      return _request('GET', `/admin/audit-logs${q ? '?' + q : ''}`, null, false, 30000);
    },
    transfer:       (body)     => _request('POST',  '/admin/budget-transfer', body),
  };

  const units = {
    checklists: (program) => _request('GET', `/units/checklists${program ? '?program=' + encodeURIComponent(program) : ''}`, null, false, 180000),
    my:         ()        => _request('GET', '/units/my', null, false, 30000),
    enroll:     (body)    => _request('POST',  '/units/enroll', body),
    update:     (id, b)   => _request('PATCH', `/units/update/${id}`, b),
    drop:       (id)      => _request('DELETE', `/units/drop/${id}`),
  };

  const announcements = {
    list:   ()       => _request('GET',  '/announcements', null, false, 45000),
    create: (body)   => _request('POST', '/announcements', body),
  };

  // ---- Background Pre-fetch Queue (Paced & Idle-friendly) ----
  async function prefetchAll(role = 'student', program = 'BSCoE') {
    try {
      // Step 1: Core data (Events, Transactions, Dashboard summary)
      await Promise.allSettled([
        events.list(),
        transactions.list({ limit: 200 }),
        reports.summary(),
        announcements.list(),
      ]);

      // Small breather for the browser main thread
      await new Promise(r => setTimeout(r, 120));

      // Step 2: Reports trends and student tracker data
      const step2 = [
        reports.monthly(),
        reports.eventsSummary(),
        units.my(),
      ];
      if (program) step2.push(units.checklists(program));
      await Promise.allSettled(step2);

      // Step 3: Admin & Officer tools (when user is admin/governor/cashier)
      if (['admin', 'governor', 'cashier'].includes(role)) {
        await new Promise(r => setTimeout(r, 120));
        await Promise.allSettled([
          admin.users(),
          admin.auditLogs({ limit: 100 }),
        ]);
      }
    } catch (err) {
      console.debug('[Api.prefetchAll] Notice:', err?.message || err);
    }
  }

  const roster = {
    async list() {
      if (window.supabaseClient) {
        const { data, error } = await window.supabaseClient
          .from('enrolled_students')
          .select('*')
          .order('full_name', { ascending: true });
        if (error) throw new Error(error.message);
        return data || [];
      }
      return [];
    },
    async create(studentData) {
      if (!window.supabaseClient) throw new Error('Supabase client not available');
      const { data, error } = await window.supabaseClient
        .from('enrolled_students')
        .insert([{
          full_name: studentData.full_name.toUpperCase().trim(),
          sex: studentData.sex || 'M',
          department: studentData.department || 'CoE',
          course: studentData.course,
          year_level: String(studentData.year_level)
        }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    async delete(id) {
      if (!window.supabaseClient) throw new Error('Supabase client not available');
      const { error } = await window.supabaseClient
        .from('enrolled_students')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
      return true;
    }
  };

  return {
    events,
    transactions,
    reports,
    admin,
    units,
    announcements,
    roster,
    request: _request,
    invalidateCache,
    hasCache,
    getCache,
    prefetchAll,
  };
})();

