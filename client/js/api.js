// =============================================
// api.js — API Helper Module
// =============================================

const Api = (() => {

  async function _getToken() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session?.access_token || null;
  }

  async function _request(method, path, body = null, isFormData = false) {
    const token = await _getToken();
    const headers = { Authorization: `Bearer ${token}` };

    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(`${window.API_BASE}/api${path}`, opts);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  const events = {
    list:   ()       => _request('GET', '/events'),
    get:    (id)     => _request('GET', `/events/${id}`),
    create: (body)   => _request('POST', '/events', body),
    update: (id, b)  => _request('PATCH', `/events/${id}`, b),
  };

  const transactions = {
    list:   (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return _request('GET', `/transactions${q ? '?' + q : ''}`);
    },
    create: (body) => _request('POST', '/transactions', body),
  };

  const reports = {
    summary: () => _request('GET', '/reports/summary'),
    monthly: () => _request('GET', '/reports/monthly'),
  };

  return { events, transactions, reports, request: _request };
})();
