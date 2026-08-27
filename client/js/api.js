// =============================================
// api.js — API Helper Module
// =============================================

const Api = (() => {

  async function _getToken() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session?.access_token || null;
  }

  const _cache = new Map();
  const _inFlight = new Map();

  function invalidateCache(prefix = '') {
    if (!prefix) {
      _cache.clear();
      return;
    }
    for (const key of _cache.keys()) {
      if (key.startsWith(prefix)) _cache.delete(key);
    }
  }

  async function _request(method, path, body = null, isFormData = false, ttlMs = 0) {
    const isGet = method.toUpperCase() === 'GET';
    const cacheKey = `${path}`;

    // Return cached response if within TTL
    if (isGet && ttlMs > 0 && _cache.has(cacheKey)) {
      const entry = _cache.get(cacheKey);
      if (Date.now() - entry.timestamp < ttlMs) {
        return JSON.parse(JSON.stringify(entry.data));
      }
      _cache.delete(cacheKey);
    }

    // Deduplicate in-flight GET requests
    if (isGet && _inFlight.has(cacheKey)) {
      return _inFlight.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        const token = await _getToken();
        const headers = { Authorization: `Bearer ${token}` };

        if (!isFormData) headers['Content-Type'] = 'application/json';

        const opts = { method, headers };
        if (body) opts.body = isFormData ? body : JSON.stringify(body);

        const res = await fetch(`${window.API_BASE}/api${path}`, opts);
        
        if (res.status === 401) {
          if (window.supabaseClient) window.supabaseClient.auth.signOut();
          throw new Error('Invalid or expired session token. Please log in again.');
        }

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);

        // Cache successful GET request
        if (isGet && ttlMs > 0) {
          _cache.set(cacheKey, { data, timestamp: Date.now() });
        } else if (!isGet) {
          // Mutating request invalidates relevant cache
          invalidateCache();
        }

        return data;
      } finally {
        if (isGet) _inFlight.delete(cacheKey);
      }
    })();

    if (isGet) _inFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }


  const events = {
    list:    ()       => _request('GET', '/events', null, false, 8000),
    get:     (id)     => _request('GET', `/events/${id}`),
    create:  (body)   => _request('POST', '/events', body),
    update:  (id, b)  => _request('PATCH', `/events/${id}`, b),
    archive: (id)     => _request('PATCH', `/admin/events/${id}/archive`),
  };

  const transactions = {
    list:   (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return _request('GET', `/transactions${q ? '?' + q : ''}`);
    },
    create: (body)        => _request('POST',   '/transactions', body),
    bulkCreate: (body)    => _request('POST',   '/transactions/bulk', { transactions: body }),
    update: (id, body)    => _request('PATCH',  `/transactions/${id}`, body),
    remove: (id, body)    => _request('DELETE', `/transactions/${id}`, body),
  };

  const reports = {
    summary:       () => _request('GET', '/reports/summary', null, false, 15000),
    monthly:       () => _request('GET', '/reports/monthly', null, false, 15000),
    eventsSummary: () => _request('GET', '/reports/events-summary', null, false, 15000),
  };

  const admin = {
    users:          ()         => _request('GET',   '/admin/users'),
    setRole:        (id, role) => _request('PATCH', `/admin/users/${id}/role`, { role }),
    auditLogs:      (params={})=> {
      const q = new URLSearchParams(params).toString();
      return _request('GET', `/admin/audit-logs${q ? '?' + q : ''}`);
    },
    transfer:       (body)     => _request('POST',  '/admin/budget-transfer', body),
  };

  const units = {
    checklists: (program) => _request('GET', `/units/checklists${program ? '?program=' + encodeURIComponent(program) : ''}`, null, false, 60000),
    my:         ()        => _request('GET', '/units/my', null, false, 5000),
    enroll:     (body)    => _request('POST',  '/units/enroll', body),
    update:     (id, b)   => _request('PATCH', `/units/update/${id}`, b),
    drop:       (id)      => _request('DELETE', `/units/drop/${id}`),
  };

  return { events, transactions, reports, admin, units, request: _request, invalidateCache };
})();

