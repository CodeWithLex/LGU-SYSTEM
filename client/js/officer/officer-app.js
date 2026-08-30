// =============================================
// officer-app.js - Officer Console Application
//
// Runs as a separate full-window app (/officer.html) sharing the main
// system's login, API layer, and receipt camera. Requires role
// governor / cashier / admin; everyone else hits the access gate.
// =============================================

const OfficerApp = (() => {

  const OFFICER_ROLES = ['admin', 'governor', 'cashier'];
  const ROLE_LABELS   = { admin: 'Admin', governor: 'Governor', cashier: 'Cashier', student: 'Student' };

  let _profile   = null;
  let _events    = [];
  let _loaded    = {};   // section -> loaded once
  let _receipt   = null; // pending receipt for the record form

  // ---------- Helpers ----------

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `of-toast ${type}`;
    el.textContent = message;
    $('of-toast-holder').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function showGate(message) {
    $('of-shell').classList.add('hidden');
    $('of-bottom-nav').classList.add('hidden');
    $('of-gate').classList.remove('hidden');
    $('of-gate-message').textContent = message;
  }

  function fmtNum(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // ---------- Boot ----------

  async function boot() {
    if (!window.supabaseClient?.auth) {
      return showGate('Authentication is unavailable. Check your internet connection and reload.');
    }

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
      return showGate('Please log in through the main system first.');
    }
    window._authToken = session.access_token;

    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) return showGate('Session expired. Log in again through the main system.');

    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('role, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (!profile || !OFFICER_ROLES.includes(profile.role)) {
      return showGate('This console is for council officers only. Ask an admin or governor to assign you an officer role.');
    }

    _profile = profile;

    // Header identity
    const name = profile.full_name || user.email;
    $('of-user-name').textContent = name;
    $('of-user-role').textContent = ROLE_LABELS[profile.role] || profile.role;
    $('of-avatar').textContent = (name[0] || '?').toUpperCase();

    bindNav();
    bindRecordForm();
    bindEventForms();
    bindTransferForm();
    bindPeopleSearch();
    bindAuditSearch();
    bindAnnouncementForm();

    $('of-shell').classList.remove('hidden');

    try {
      await refreshCoreData();
      switchSection('overview');
    } catch (err) {
      toast('Could not load initial data: ' + err.message, 'error');
    }
  }

  async function refreshCoreData() {
    const [events, txs] = await Promise.all([
      Api.events.list(),
      Api.transactions.list({ limit: 200 })
    ]);
    _events = events;
    _txs = txs;
  }

  // ---------- Navigation ----------

  function bindNav() {
    document.querySelectorAll('[data-of]').forEach(btn => {
      btn.addEventListener('click', () => switchSection(btn.dataset.of));
    });
  }

  async function switchSection(section) {
    document.querySelectorAll('.of-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('[data-of]').forEach(b => b.classList.toggle('active', b.dataset.of === section));
    $(`of-view-${section}`).classList.add('active');

    try {
      if (section === 'overview')  { await loadOverview(); }
      if (section === 'record')    { await loadRecord(); }
      if (section === 'events')    { await loadEvents(); }
      if (section === 'reports')   { await loadReports(); }
      if (section === 'people')    { await loadPeople(); }
      if (section === 'announcements') { await loadAnnouncements(); }
      _loaded[section] = true;
    } catch (err) {
      toast(err.message || 'Failed to load section.', 'error');
    }
  }

  const activeEvents = () => _events.filter(ev => ev.status !== 'archived');

  // ---------- 1. Fund Overview ----------

  async function loadOverview() {
    await refreshCoreData();
    const summary = await Api.reports.summary();

    const reserved = Number(summary.breakdown?.reserved_envelopes || 0);
    const total    = Number(summary.remainingBalance || 0) + reserved;

    // Month-to-date net from the transaction list
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let mtdIn = 0, mtdOut = 0;
    (_txs || []).forEach(tx => {
      if ((tx.transaction_date || '').startsWith(monthPrefix)) {
        if (tx.type === 'expense') mtdOut += Number(tx.amount);
        else mtdIn += Number(tx.amount);
      }
    });

    $('of-overview-stats').innerHTML = `
      <div class="of-stat"><div class="of-stat-label">Total Council Funds</div><div class="of-stat-value">₱${fmtNum(total)}</div></div>
      <div class="of-stat is-green"><div class="of-stat-label">General Fund Available</div><div class="of-stat-value">₱${fmtNum(summary.remainingBalance)}</div><div class="of-stat-sub">Unreserved cash</div></div>
      <div class="of-stat"><div class="of-stat-label">Reserved in Events</div><div class="of-stat-value">₱${fmtNum(reserved)}</div><div class="of-stat-sub">${_events.filter(e => e.status !== 'archived').length} active events</div></div>
      <div class="of-stat ${mtdIn - mtdOut >= 0 ? 'is-green' : 'is-red'}"><div class="of-stat-label">This Month, Net</div><div class="of-stat-value">${mtdIn - mtdOut >= 0 ? '+' : '-'}₱${fmtNum(Math.abs(mtdIn - mtdOut))}</div><div class="of-stat-sub">In ₱${fmtNum(mtdIn)} · Out ₱${fmtNum(mtdOut)}</div></div>
    `;

    // Alerts: events at or past 90% of allocation
    const alerts = activeEvents().filter(ev => {
      const budget = Number(ev.allocated_budget) || 0;
      if (budget <= 0) return false;
      return Number(ev.computed_expenses) >= budget * 0.9;
    });

    $('of-overview-alerts').innerHTML = alerts.length
      ? alerts.map(ev => {
          const budget = Number(ev.allocated_budget);
          const spent  = Number(ev.computed_expenses);
          const over   = spent > budget;
          return `<div class="of-alert-item ${over ? 'is-over' : ''}">
            <span>${esc(ev.event_name)}</span>
            <strong>${over ? `OVER by ₱${fmtNum(spent - budget)}` : `${fmtNum(((spent / budget) * 100))}% used`}</strong>
          </div>`;
        }).join('')
      : '<div class="of-alert-item">No budget alerts. All events are in healthy range.</div>';

    const recent = (_txs || []).slice(0, 6);
    $('of-overview-recent').innerHTML = recent.length
      ? recent.map(tx => `
          <div class="of-recent-item">
            <div><div>${esc(tx.description)}</div><span class="of-when">${UI.dateStr(tx.transaction_date)} · ${esc(tx.type)}</span></div>
            <span class="${tx.type === 'expense' ? 'is-neg' : 'is-pos'}">${tx.type === 'expense' ? '-' : '+'}₱${fmtNum(tx.amount)}</span>
          </div>`).join('')
      : '<div class="of-recent-item">No transactions recorded yet.</div>';
  }

  // ---------- 2. Record Transaction ----------

  function bindRecordForm() {
    const typeSel  = $('of-tx-type');
    const eventSel = $('of-tx-event');
    const allocField = $('of-tx-alloc-field');

    $('of-tx-date').value = new Date().toISOString().split('T')[0];

    const updateAllocVisibility = () => {
      allocField.style.display = (typeSel.value === 'expense' && eventSel.value) ? 'block' : 'none';
      if (allocField.style.display === 'none') $('of-tx-alloc').checked = true;
      updateEventBalance();
    };
    typeSel.addEventListener('change', updateAllocVisibility);
    eventSel.addEventListener('change', updateAllocVisibility);

    // Receipt capture (shared component)
    $('of-tx-receipt-btn').addEventListener('click', async () => {
      const captured = await ReceiptCapture.open();
      if (!captured) return;
      _receipt = captured;
      $('of-tx-receipt-chip-text').textContent = `${captured.name} (${Math.round(captured.size / 1024)} KB)`;
      $('of-tx-receipt-chip').classList.remove('hidden');
    });
    $('of-tx-receipt-remove').addEventListener('click', () => {
      _receipt = null;
      $('of-tx-receipt-chip').classList.add('hidden');
    });

    $('of-tx-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-tx-error');
      errEl.classList.add('hidden');
      const btn = $('of-tx-submit');
      btn.disabled = true;
      btn.textContent = 'Recording…';

      try {
        let payload;
        if (_receipt) {
          payload = new FormData();
          payload.append('event_id',         eventSel.value);
          payload.append('type',             typeSel.value);
          payload.append('amount',           $('of-tx-amount').value);
          payload.append('description',      $('of-tx-desc').value);
          payload.append('donor_name',       $('of-tx-donor').value);
          payload.append('transaction_date', $('of-tx-date').value);
          payload.append('use_allocation',   (typeSel.value === 'expense' && eventSel.value) ? String($('of-tx-alloc').checked) : 'false');
          payload.append('receipt',          _receipt.blob, _receipt.name);
        } else {
          payload = {
            event_id:         eventSel.value,
            type:             typeSel.value,
            amount:           $('of-tx-amount').value,
            description:      $('of-tx-desc').value,
            donor_name:       $('of-tx-donor').value,
            transaction_date: $('of-tx-date').value,
            use_allocation:   (typeSel.value === 'expense' && eventSel.value) ? $('of-tx-alloc').checked : false
          };
        }

        const tx = await Api.transactions.create(payload);
        if (tx.warning)                            toast(tx.warning, 'warning');
        else if (tx.over_budget_warning)           toast('Recorded, but the event is OVER 90% BUDGET CAPACITY!', 'warning');
        else                                       toast('Transaction recorded.', 'success');

        e.target.reset();
        clearReceiptChip();
        $('of-tx-date').value = new Date().toISOString().split('T')[0];
        await refreshCoreData();
        updateEventBalance();
        populateEventSelects();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Record Transaction';
      }
    });
  }

  function clearReceiptChip() {
    _receipt = null;
    $('of-tx-receipt-chip').classList.add('hidden');
  }

  function updateEventBalance() {
    const ev = _events.find(e => e.id === $('of-tx-event').value);
    const box = $('of-record-event-info');
    if (!ev) {
      box.innerHTML = 'Select an event to see its available budget.';
      return;
    }
    const budget = Number(ev.allocated_budget) || 0;
    const spent  = Number(ev.computed_expenses) || 0;
    const rem    = Number(ev.computed_remaining) || 0;
    const over   = budget > 0 && spent > budget;
    box.innerHTML = `
      <strong>${esc(ev.event_name)}</strong><br/>
      Allocated: <strong>₱${fmtNum(budget)}</strong><br/>
      Spent: <strong>₱${fmtNum(spent)}</strong><br/>
      Remaining: <strong style="color:${over || rem < 0 ? 'var(--of-red)' : 'var(--of-green)'}">₱${fmtNum(rem)}</strong>
      ${over ? '<br/><em style="color:var(--of-red)">This event is over budget.</em>' : ''}
    `;
  }

  async function loadRecord() {
    populateEventSelects();
    updateEventBalance();
  }

  function populateEventSelects() {
    const opts = '<option value="">Select Event</option>' +
      activeEvents().map(ev => `<option value="${ev.id}">${esc(ev.event_name)}</option>`).join('');
    $('of-tx-event').innerHTML = opts;
  }

  // ---------- 3. Events & Budgets ----------

  function bindEventForms() {
    $('of-event-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-ev-error');
      errEl.classList.add('hidden');
      const btn = $('of-ev-submit');
      btn.disabled = true;
      btn.textContent = 'Creating…';
      try {
        await Api.events.create({
          event_name:       $('of-ev-name').value,
          description:      $('of-ev-desc').value,
          allocated_budget: $('of-ev-budget').value,
          event_date:       $('of-ev-date').value || null,
          status:           $('of-ev-status').value
        });
        toast('Event created.', 'success');
        e.target.reset();
        await refreshCoreData();
        await renderEventsGrid();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Event';
      }
    });
  }

  function bindTransferForm() {
    const fromSel = $('of-transfer-from');
    const toSel   = $('of-transfer-to');
    const amountIn = $('of-transfer-amount');

    const updatePreview = () => {
      const box = $('of-transfer-preview');
      if (!fromSel.value || !toSel.value || fromSel.value === toSel.value) {
        box.classList.add('hidden');
        return;
      }
      box.classList.remove('hidden');
      const fmt = (id) => {
        if (id === 'GENERAL') return `₱${fmtNum(0)} + general fund`;
        const ev = _events.find(e => e.id === id);
        return ev ? `₱${fmtNum(ev.computed_remaining)}` : '—';
      };
      box.innerHTML = `
        <div><div style="font-size:0.68rem;text-transform:uppercase;color:var(--of-ink-3)">From</div><strong>${fromSel.value === 'GENERAL' ? 'General Fund' : esc(_events.find(e => e.id === fromSel.value)?.event_name || '')}</strong> · ${fmt(fromSel.value)}</div>
        <div style="text-align:right"><div style="font-size:0.68rem;text-transform:uppercase;color:var(--of-ink-3)">To</div><strong>${esc(_events.find(e => e.id === toSel.value)?.event_name || '')}</strong> · ${fmt(toSel.value)}</div>`;
    };
    fromSel.addEventListener('change', updatePreview);
    toSel.addEventListener('change', updatePreview);
    amountIn.addEventListener('input', updatePreview);

    $('of-transfer-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-transfer-error');
      errEl.classList.add('hidden');
      const btn = $('of-transfer-submit');
      btn.disabled = true;
      btn.textContent = 'Transferring…';
      try {
        const res = await Api.admin.transfer({
          from_event_id: fromSel.value,
          to_event_id:   toSel.value,
          amount:        amountIn.value,
          reason:        $('of-transfer-reason').value
        });
        toast(res.message || 'Transfer complete.', 'success');
        e.target.reset();
        boxHide();
        await refreshCoreData();
        await renderEventsGrid();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Transfer';
      }
      function boxHide() { $('of-transfer-preview').classList.add('hidden'); }
    });
  }

  async function loadEvents() {
    // Transfer selects include the General Fund as a source
    const opts = '<option value="">Select Event</option>' +
      activeEvents().map(ev => `<option value="${ev.id}">${esc(ev.event_name)}</option>`).join('');
    $('of-transfer-from').innerHTML = '<option value="GENERAL">GENERAL FUND</option>' + opts;
    $('of-transfer-to').innerHTML   = opts;
    $('of-transfer-from').insertAdjacentHTML('afterbegin', '');
    await renderEventsGrid();
  }

  async function renderEventsGrid() {
    // Data may be stale after other-section actions
    await refreshCoreData();
    const grid = $('of-events-grid');
    const list = activeEvents();
    grid.innerHTML = list.length ? list.map(ev => {
      const budget = Number(ev.allocated_budget) || 0;
      const spent  = Number(ev.computed_expenses) || 0;
      const over   = budget > 0 && spent > budget;
      const pct    = over ? 100 : (budget > 0 ? Math.min((spent / budget) * 100, 100) : 0);
      return `
        <div class="of-event-card" data-ev="${ev.id}">
          ${UI.renderStatusBadge(ev.status)}
          <h4 style="margin-top:0.5rem">${esc(ev.event_name)}</h4>
          ${ev.event_date ? `<div class="of-event-date"><iconify-icon icon="solar:calendar-date-linear"></iconify-icon> ${UI.dateStr(ev.event_date)}</div>` : ''}
          <div class="of-budget-bar"><div class="of-budget-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
          <div class="of-budget-labels"><span>Spent ₱${fmtNum(spent)}</span><span>Alloc ₱${fmtNum(budget)}</span></div>
          ${over ? `<div class="of-over-note">Over budget by ₱${fmtNum(spent - budget)}</div>` : ''}
          <div class="of-event-actions">
            <button class="of-btn of-btn-ghost" data-act="detail">Manage</button>
            ${ev.status !== 'completed' && ev.status !== 'archived' ? '<button class="of-btn of-btn-ghost" data-act="complete">Mark Completed</button>' : ''}
            ${ev.status !== 'archived'
              ? '<button class="of-btn of-btn-ghost" data-act="archive">Archive</button>'
              : '<button class="of-btn of-btn-ghost" data-act="restore">Restore</button>'}
          </div>
        </div>`;
    }).join('') : '<p style="color:var(--of-ink-2);font-size:0.85rem">No events yet. Create one above.</p>';

    grid.querySelectorAll('.of-event-card').forEach(card => {
      const ev = _events.find(e => e.id === card.dataset.ev);
      card.querySelector('[data-act="detail"]').addEventListener('click', () => renderEventDetail(ev.id));
      const completeBtn = card.querySelector('[data-act="complete"]');
      if (completeBtn) completeBtn.addEventListener('click', () => completeEvent(ev));
      const archiveBtn = card.querySelector('[data-act="archive"]');
      if (archiveBtn) archiveBtn.addEventListener('click', () => archiveEvent(ev, true));
      const restoreBtn = card.querySelector('[data-act="restore"]');
      if (restoreBtn) restoreBtn.addEventListener('click', () => archiveEvent(ev, false));
    });
  }

  function renderEventDetail(id) {
    const ev = _events.find(e => e.id === id);
    if (!ev) return;
    const panel = $('of-event-detail');
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth' });

    panel.innerHTML = `
      <div class="of-card" style="margin-top:1.1rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
          <div>
            ${UI.renderStatusBadge(ev.status)}
            <h3 style="margin-top:0.5rem">${esc(ev.event_name)}</h3>
            <p style="font-size:0.8rem;color:var(--of-ink-2)">${esc(ev.description || 'No description.')}</p>
          </div>
          <button class="of-btn of-btn-ghost" id="of-detail-close">Close</button>
        </div>
        <div class="of-stat-grid" style="margin-top:1rem">
          <div class="of-stat"><div class="of-stat-label">Allocated</div><div class="of-stat-value">₱${fmtNum(ev.allocated_budget)}</div></div>
          <div class="of-stat is-red"><div class="of-stat-label">Spent</div><div class="of-stat-value">₱${fmtNum(ev.computed_expenses)}</div></div>
          <div class="of-stat is-green"><div class="of-stat-label">Remaining</div><div class="of-stat-value">₱${fmtNum(ev.computed_remaining)}</div></div>
        </div>
        <form id="of-detail-form" class="of-form">
          <div class="of-form-row">
            <div class="of-field"><label>Event Name</label><input type="text" id="of-me-name" value="${esc(ev.event_name)}" required /></div>
            <div class="of-field"><label>Status</label>
              <select id="of-me-status">
                ${['upcoming','ongoing','completed','cancelled'].map(s => `<option value="${s}" ${ev.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="of-form-row">
            <div class="of-field"><label>Allocated Budget (₱)</label><input type="number" id="of-me-budget" min="0" step="0.01" value="${ev.allocated_budget}" required /></div>
            <div class="of-field"><label>Event Date</label><input type="date" id="of-me-date" value="${ev.event_date || ''}" /></div>
          </div>
          <div class="of-field"><label>Description</label><textarea id="of-me-desc" rows="2">${esc(ev.description || '')}</textarea></div>
          <div class="of-error hidden" id="of-me-error"></div>
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
            <button class="of-btn of-btn-primary" type="submit">Save Changes</button>
            <button class="of-btn of-btn-ghost" type="button" id="of-detail-receipts">Transaction History</button>
          </div>
        </form>
        <div id="of-detail-txs" style="margin-top:1rem"></div>
      </div>`;

    $('of-detail-close').addEventListener('click', () => panel.classList.add('hidden'));

    $('of-detail-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-me-error');
      errEl.classList.add('hidden');
      try {
        await Api.events.update(ev.id, {
          event_name:       $('of-me-name').value,
          description:      $('of-me-desc').value,
          allocated_budget: $('of-me-budget').value,
          event_date:       $('of-me-date').value || null,
          status:           $('of-me-status').value
        });
        toast('Event updated.', 'success');
        await refreshCoreData();
        await renderEventsGrid();
        renderEventDetail(ev.id);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    $('of-detail-receipts').addEventListener('click', async () => {
      const box = $('of-detail-txs');
      box.innerHTML = '<p style="font-size:0.8rem;color:var(--of-ink-2)">Loading history…</p>';
      try {
        const detail = await Api.events.get(ev.id);
        box.innerHTML = detail.transactions?.length
          ? detail.transactions.map(tx => `
              <div class="of-recent-item">
                <div><div>${esc(tx.description)}</div><span class="of-when">${UI.dateStr(tx.transaction_date)} · ${esc(tx.type)}</span></div>
                <div style="text-align:right">
                  <span class="${tx.type === 'expense' ? 'is-neg' : 'is-pos'}">${tx.type === 'expense' ? '-' : '+'}₱${fmtNum(tx.amount)}</span>
                  ${tx.receipt_url ? `<div><a class="receipt-link" href="${tx.receipt_url}" target="_blank" style="font-size:0.72rem;color:var(--of-accent)">Receipt</a></div>` : ''}
                </div>
              </div>`).join('')
          : '<p style="font-size:0.8rem;color:var(--of-ink-2)">No transactions for this event yet.</p>';
      } catch (err) {
        box.innerHTML = `<p style="font-size:0.8rem;color:var(--of-red)">${esc(err.message)}</p>`;
      }
    });
  }

  async function completeEvent(ev) {
    if (!confirm(`Mark "${ev.event_name}" as completed?`)) return;
    try {
      await Api.events.update(ev.id, { status: 'completed' });
      toast(`"${ev.event_name}" marked as completed.`, 'success');
      await refreshCoreData();
      await renderEventsGrid();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function archiveEvent(ev, archiving) {
    if (archiving && !confirm(`Archive "${ev.event_name}"? It will be hidden from students. You can restore it here.`)) return;
    try {
      if (archiving) {
        await Api.events.archive(ev.id);
        toast('Event archived.', 'success');
      } else {
        await Api.events.update(ev.id, { status: 'upcoming' });
        toast('Event restored.', 'success');
      }
      await refreshCoreData();
      await renderEventsGrid();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- 4. Reports & Paper Trail ----------

  async function loadReports() {
    const summary = await Api.reports.eventsSummary();
    const tbody = $('of-events-summary-table').querySelector('tbody');
    tbody.innerHTML = summary.length ? summary.map(ev => `
      <tr>
        <td>${esc(ev.event_name)}</td>
        <td class="num">₱${fmtNum(ev.allocated_budget)}</td>
        <td class="num">₱${fmtNum((Number(ev.allocated_budget) || 0) + (Number(ev.computed_remaining) || 0) === 0 ? 0 : Math.max(0, (Number(ev.allocated_budget) || 0) - (Number(ev.computed_remaining) || 0)))}</td>
        <td class="num">₱${fmtNum(ev.computed_remaining)}</td>
        <td>${UI.renderStatusBadge(ev.status)}</td>
        <td><button class="of-btn of-btn-ghost" data-pdf="${ev.id}" data-name="${esc(ev.event_name)}" style="padding:0.3rem 0.6rem;font-size:0.72rem"><iconify-icon icon="solar:download-minimalistic-linear"></iconify-icon> PDF</button></td>
      </tr>`).join('')
      : '<tr><td colspan="6">No events yet.</td></tr>';

    tbody.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', () => downloadPdf(btn.dataset.pdf, btn.dataset.name, btn));
    });

    await loadAudit();
  }

  async function downloadPdf(eventId, eventName, btn) {
    const token = window._authToken;
    if (!token) { toast('Please log in again.', 'error'); return; }
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      const res = await fetch(`${window.API_BASE}/api/reports/pdf/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${eventName.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  let _auditRows = [];

  async function loadAudit() {
    _auditRows = await Api.admin.auditLogs({ limit: 100 });
    renderAuditTable();
  }

  function bindAuditSearch() {
    $('of-audit-search').addEventListener('input', renderAuditTable);
  }

  function renderAuditTable() {
    const q = ($('of-audit-search').value || '').toLowerCase();
    const rows = _auditRows.filter(l => {
      if (!q) return true;
      const hay = `${l.profiles?.full_name || ''} ${l.action} ${JSON.stringify(l.details || {})}`.toLowerCase();
      return hay.includes(q);
    });
    const tbody = $('of-audit-table').querySelector('tbody');
    tbody.innerHTML = rows.length ? rows.map(log => `
      <tr>
        <td style="white-space:nowrap">${UI.dateStr(log.created_at)}</td>
        <td>${esc(log.profiles?.full_name || 'Unknown')}</td>
        <td>${esc(log.action)}</td>
        <td style="font-size:0.76rem;color:var(--of-ink-2)">${esc(summarizeDetails(log.details))}</td>
      </tr>`).join('')
      : '<tr><td colspan="4">No matching audit entries.</td></tr>';
  }

  function summarizeDetails(d = {}) {
    const parts = [];
    if (d.event_name)       parts.push(d.event_name);
    if (d.description)      parts.push(d.description);
    if (d.user_name)        parts.push(`user: ${d.user_name}`);
    if (d.new_role)         parts.push(`role → ${d.new_role}`);
    if (d.amount != null)   parts.push(`₱${fmtNum(d.amount)}`);
    if (d.from_event_name)  parts.push(`from ${d.from_event_name}`);
    if (d.to_event_name)    parts.push(`to ${d.to_event_name}`);
    if (!parts.length) {
      const keys = Object.keys(d).slice(0, 3);
      parts.push(...keys.map(k => `${k}: ${String(d[k]).slice(0, 40)}`));
    }
    return parts.join(' · ');
  }

  // ---------- 5. People & Access ----------

  let _users = [];

  const canAssignRoles = () => _profile.role === 'admin' || _profile.role === 'governor';
  const assignableRoles = () => _profile.role === 'admin'
    ? ['student', 'governor', 'cashier', 'admin']
    : ['student', 'governor', 'cashier'];

  function bindPeopleSearch() {
    $('of-people-search').addEventListener('input', renderPeopleTable);
  }

  async function loadPeople() {
    _users = await Api.admin.users();
    const canAssign = canAssignRoles();
    $('of-people-sub').textContent = canAssign
      ? `You can assign: ${assignableRoles().join(', ')}` + (_profile.role === 'governor' ? ' (admin accounts are out of your reach)' : '')
      : 'Read-only: cashiers cannot assign roles.';
    $('of-people-action-col').style.display = canAssign ? '' : 'none';
    renderPeopleTable();
  }

  function renderPeopleTable() {
    const q = ($('of-people-search').value || '').toLowerCase();
    const rows = _users.filter(u =>
      !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q)
    );
    const canAssign = canAssignRoles();
    const tbody = $('of-people-table').querySelector('tbody');
    tbody.innerHTML = rows.length ? rows.map(u => `
      <tr>
        <td>${esc(u.full_name)}</td>
        <td style="font-size:0.78rem;color:var(--of-ink-2)">${esc(u.email)}</td>
        <td>${UI.renderStatusBadge(u.role)}</td>
        <td style="${canAssign ? '' : 'display:none'}">
          ${canAssign && u.id !== _profile.id
            ? `<div style="display:flex;gap:0.4rem">
                 <select data-role-for="${u.id}" style="padding:0.35rem;border:1px solid var(--of-line);border-radius:6px;font-size:0.76rem">
                   ${assignableRoles().map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                 </select>
                 <button class="of-btn of-btn-ghost" data-apply="${u.id}" style="padding:0.3rem 0.6rem;font-size:0.72rem">Apply</button>
               </div>`
            : (u.id === _profile.id ? '<span style="color:var(--of-ink-3);font-size:0.75rem">You</span>' : '—')}
        </td>
      </tr>`).join('')
      : '<tr><td colspan="4">No matching people.</td></tr>';

    tbody.querySelectorAll('[data-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.apply;
        const role = tbody.querySelector(`[data-role-for="${id}"]`).value;
        if (!confirm(`Set this person's role to ${ROLE_LABELS[role]}?`)) return;
        try {
          await Api.admin.setRole(id, role);
          toast('Role updated.', 'success');
          _users = await Api.admin.users();
          renderPeopleTable();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  // ---------- 6. Announcements ----------

  function bindAnnouncementForm() {
    $('of-announce-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-announce-error');
      errEl.classList.add('hidden');
      const btn = $('of-announce-submit');
      btn.disabled = true;
      btn.textContent = 'Posting…';
      try {
        await Api.request('POST', '/announcements', {
          title: $('of-announce-title').value,
          body:  $('of-announce-body').value
        });
        toast('Announcement posted.', 'success');
        e.target.reset();
        await loadAnnouncements();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Post Announcement';
      }
    });
  }

  async function loadAnnouncements() {
    const list = await Api.request('GET', '/announcements');
    $('of-announce-list').innerHTML = list.length ? list.map(a => `
      <div class="of-announce-item">
        <strong>${esc(a.title)}</strong>
        <p>${esc(a.body)}</p>
        <span class="of-when">${UI.dateStr(a.created_at)}</span>
      </div>`).join('')
      : '<p style="font-size:0.82rem;color:var(--of-ink-2)">No announcements yet.</p>';
  }

  // ---------- Start ----------

  document.addEventListener('DOMContentLoaded', boot);

  return { boot };
})();
