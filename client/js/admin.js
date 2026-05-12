// =============================================
// admin.js — Admin View Module (Phase 4)
// =============================================

const Admin = (() => {

  let _initialized  = false;
  let _currentTab   = 'create';
  let _allEvents    = [];

  async function init() {
    await populateEventDropdown();
    if (!_initialized) {
      bindTabSwitching();
      bindEventForm();
      bindTransactionForm();
      bindAnnouncementForm();
      bindBudgetTransferForm();
      _initialized = true;
    }
    setTodayDate();
    switchTab(_currentTab);
  }

  // ── Tab Switching ──────────────────────────────────────────────────────────
  function bindTabSwitching() {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    _currentTab = tab;
    document.querySelectorAll('.admin-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.querySelectorAll('.admin-tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === `admin-tab-${tab}`)
    );
    if (tab === 'users')  loadUsers();
    if (tab === 'audit')  loadAuditLog();
  }

  // ── Event Dropdown ─────────────────────────────────────────────────────────
  async function populateEventDropdown() {
    try {
      _allEvents = await Api.events.list();
      const opts = '<option value="">Select Event</option>' +
        _allEvents.map(ev => `<option value="${ev.id}">${ev.event_name}</option>`).join('');
      document.querySelectorAll('.event-select-dropdown').forEach(el => { el.innerHTML = opts; });
    } catch { /* non-fatal */ }
  }

  function setTodayDate() {
    const d = document.getElementById('tx-date');
    if (d) d.value = new Date().toISOString().split('T')[0];
  }

  // ── Create Event ───────────────────────────────────────────────────────────
  function bindEventForm() {
    const form  = document.getElementById('add-event-form');
    const errEl = document.getElementById('ev-error');
    const btn   = document.getElementById('submit-ev-btn');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Creating…';

      try {
        const ev = await Api.events.create({
          event_name:       document.getElementById('ev-name').value,
          description:      document.getElementById('ev-description').value,
          allocated_budget: document.getElementById('ev-budget').value,
          event_date:       document.getElementById('ev-date').value || null,
          status:           document.getElementById('ev-status').value
        });
        UI.toast('Event created successfully!', 'success');
        form.reset();
        await populateEventDropdown();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Event';
      }
    });
  }

  // ── Add Transaction ────────────────────────────────────────────────────────
  function bindTransactionForm() {
    const form  = document.getElementById('add-tx-form');
    const errEl = document.getElementById('tx-error');
    const btn   = document.getElementById('submit-tx-btn');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        const receiptUrl = document.getElementById('tx-receipt-url').value.trim();
        await Api.transactions.create({
          event_id:         document.getElementById('tx-event-id').value,
          type:             document.getElementById('tx-type').value,
          amount:           document.getElementById('tx-amount').value,
          description:      document.getElementById('tx-desc').value,
          donor_name:       document.getElementById('tx-donor').value,
          transaction_date: document.getElementById('tx-date').value,
          receipt_url:      receiptUrl || null
        });
        UI.toast('Transaction recorded successfully!', 'success');
        form.reset();
        setTodayDate();
        await populateEventDropdown();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Transaction';
      }
    });
  }

  // ── Announcement ───────────────────────────────────────────────────────────
  function bindAnnouncementForm() {
    const form  = document.getElementById('add-announce-form');
    const errEl = document.getElementById('announce-error');
    const btn   = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Posting…';

      try {
        await Api.request('POST', '/announcements', {
          title: document.getElementById('announce-title').value,
          body:  document.getElementById('announce-body').value
        });
        UI.toast('Announcement posted! Students will be notified. 📧', 'success');
        form.reset();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Post Announcement';
      }
    });
  }

  // ── Budget Transfer ───────────────────────────────────────────────────────
  function bindBudgetTransferForm() {
    const form  = document.getElementById('transfer-form');
    if (!form) return;
    const errEl = document.getElementById('transfer-error');
    const btn   = document.getElementById('submit-transfer-btn');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Transferring…';

      try {
        const result = await Api.admin.transfer({
          from_event_id: document.getElementById('transfer-from').value,
          to_event_id:   document.getElementById('transfer-to').value,
          amount:        document.getElementById('transfer-amount').value,
          reason:        document.getElementById('transfer-reason').value,
        });
        UI.toast(result.message, 'success');
        form.reset();
        await populateEventDropdown();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Transfer';
      }
    });
  }

  // ── Users Tab ─────────────────────────────────────────────────────────────
  async function loadUsers() {
    const container = document.getElementById('admin-tab-users');
    container.innerHTML = '<div class="loading-state">Loading users…</div>';

    try {
      const users = await Api.admin.users();
      container.innerHTML = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Course</th><th>Year</th><th>Role</th><th style="text-align:center;">Action</th></tr></thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>${u.full_name || '—'}</strong></td>
                  <td style="font-size:.8rem;color:var(--col-text-muted)">${u.email || '—'}</td>
                  <td style="font-size:.8rem">${u.course || '—'}</td>
                  <td style="font-size:.8rem">${u.year_level || '—'}</td>
                  <td><span class="status-badge ${u.role === 'admin' ? 'status-ongoing' : 'status-upcoming'}">${u.role}</span></td>
                  <td style="text-align:center;">
                    <button class="btn btn-ghost" style="font-size:.8rem;padding:.3rem .7rem;"
                      onclick="Admin.toggleRole('${u.id}', '${u.role}', this)">
                      ${u.role === 'admin' ? 'Demote' : 'Promote to Admin'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state">⚠️ ${err.message}</div>`;
    }
  }

  async function toggleRole(userId, currentRole, btn) {
    const newRole = currentRole === 'admin' ? 'student' : 'admin';
    if (!confirm(`Are you sure you want to ${newRole === 'admin' ? 'promote this user to Admin' : 'demote this user to Student'}?`)) return;
    btn.disabled = true;
    btn.textContent = 'Updating…';
    try {
      await Api.admin.setRole(userId, newRole);
      UI.toast(`User role updated to "${newRole}".`, 'success');
      loadUsers();
    } catch (err) {
      UI.toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = currentRole === 'admin' ? 'Demote' : 'Promote to Admin';
    }
  }

  // ── Audit Log Tab ─────────────────────────────────────────────────────────
  async function loadAuditLog() {
    const container = document.getElementById('admin-tab-audit');
    container.innerHTML = '<div class="loading-state">Loading audit log…</div>';

    try {
      const logs = await Api.admin.auditLogs({ limit: 50 });

      if (!logs.length) {
        container.innerHTML = '<div class="empty-state">No audit log entries yet.</div>';
        return;
      }

      const fmtDate = d => new Date(d).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      const actionLabel = a => ({
        CREATE_TRANSACTION: '📝 Created Transaction',
        EDIT_TRANSACTION:   '✏️ Edited Transaction',
        DELETE_TRANSACTION: '🗑️ Deleted Transaction',
        CREATE_EVENT:       '📅 Created Event',
        UPDATE_EVENT:       '📝 Updated Event',
        ARCHIVE_EVENT:      '📦 Archived Event',
        POST_ANNOUNCEMENT:  '📢 Posted Announcement',
        SET_USER_ROLE:      '🛡️ Changed User Role',
        BUDGET_TRANSFER:    '💸 Budget Transfer',
      }[a] || a);

      container.innerHTML = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td style="font-size:.8rem;white-space:nowrap">${fmtDate(log.created_at)}</td>
                  <td style="font-size:.8rem">${log.profiles?.full_name || '—'}</td>
                  <td><span style="font-size:.82rem">${actionLabel(log.action)}</span></td>
                  <td style="font-size:.78rem;color:var(--col-text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;">
                    ${JSON.stringify(log.details || {})}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state">⚠️ ${err.message}</div>`;
    }
  }

  return { init, toggleRole };
})();
