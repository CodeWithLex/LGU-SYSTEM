// =============================================
// officer-app.js - Executive Portal Application
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
  let _txs       = [];
  let _loaded    = {};   // section -> loaded once
  let _receipt   = null; // pending receipt for the record form

  let _monthlyData = null;
  let _summaryBreakdownData = null;
  let _chartInstances = {};
  let _eventStatusFilter = 'all';

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

  // Skeleton placeholders (reuse the main system's shimmer classes from main.css)
  function skeletonStack(lines = 3) {
    const rows = Array.from({ length: lines }, (_, i) =>
      `<div class="skeleton skeleton-line${i === lines - 1 ? ' short' : ''}"></div>`).join('');
    return `<div class="skeleton-stack" role="status" aria-label="Loading">
      <div class="skeleton skeleton-title"></div>${rows}</div>`;
  }
  function skeletonRows(colspan, rows = 4) {
    return Array.from({ length: rows }, () =>
      `<tr><td colspan="${colspan}"><div class="skeleton skeleton-line" style="height:14px;margin:0.45rem 0;"></div></td></tr>`).join('');
  }
  function skeletonStatCards(n = 4) {
    return Array.from({ length: n }, () => '<div class="skeleton skeleton-card" style="height:96px;"></div>').join('');
  }
  function skeletonEventCards(n = 6) {
    return Array.from({ length: n }, () => '<div class="skeleton skeleton-card" style="height:190px;"></div>').join('');
  }

  function getThemeColor(varName, fallback) {
    const color = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return color || fallback;
  }

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
      return showGate('This portal is for council officers only. Ask an admin or governor to assign you an officer role.');
    }

    _profile = profile;

    // Header identity
    const name = profile.full_name || user.email;
    $('of-user-name').textContent = name;
    $('of-user-role').textContent = ROLE_LABELS[profile.role] || profile.role;
    if (profile.avatar_url) {
      $('of-avatar').innerHTML = `<img src="${profile.avatar_url}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      $('of-avatar').textContent = (name[0] || '?').toUpperCase();
    }

    bindTheme();
    bindNav();
    // Replace the portal's native selects with the shared animated dropdowns
    Dropdowns.bindAll('#of-shell');
    bindRecordForm();
    bindEventForms();
    bindEventFilters();
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

  function bindTheme() {
    const updateIcon = () => {
      const currentTheme = localStorage.getItem('theme') || 'dark';
      const icon = currentTheme === 'dark' ? 'solar:sun-linear' : 'solar:moon-linear';
      const title = currentTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
      const iconEl = $('theme-icon');
      const btnEl = $('theme-toggle-btn');
      if (iconEl) iconEl.setAttribute('icon', icon);
      if (btnEl) btnEl.setAttribute('title', title);
    };

    const toggleBtn = $('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const cur = localStorage.getItem('theme') || 'dark';
        const next = cur === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
        updateIcon();
        reloadCharts();
      });
    }
    updateIcon();
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

  // ---------- Interactive Charts ----------

  function renderChartInstance(canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas || !window.Chart) return;
    if (_chartInstances[canvasId]) {
      _chartInstances[canvasId].destroy();
    }
    _chartInstances[canvasId] = new Chart(canvas, config);
  }

  function drawMonthlyChart(canvasId, monthly) {
    if (!monthly || !monthly.length) return;
    const labels = monthly.map(m => {
      const [y, mo] = m.month.split('-');
      return new Date(y, mo - 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
    });

    const textColor = getThemeColor('--text-secondary', '#94A3B8');
    const gridColor = getThemeColor('--border', '#28313A');

    renderChartInstance(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Income',
            data: monthly.map(m => m.income),
            backgroundColor: '#F97316',
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 35,
            categoryPercentage: 0.8,
            barPercentage: 0.9
          },
          {
            label: 'Expenses',
            data: monthly.map(m => m.expense),
            backgroundColor: '#475569',
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 35,
            categoryPercentage: 0.8,
            barPercentage: 0.9
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: textColor, font: { family: 'Inter' } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => `₱${(v / 1000).toFixed(0)}k` } }
        }
      }
    });
  }

  function drawBreakdownChart(canvasId, breakdown) {
    if (!breakdown) return;
    const typeMap = [
      { key: 'expense',    label: 'Expenses',   color: '#EF4444' },
      { key: 'allocation', label: 'Allocation', color: '#94A3B8' },
      { key: 'donation',   label: 'Donations',  color: '#22C55E' },
      { key: 'collection', label: 'Collection', color: '#F97316' },
    ];

    const active = typeMap.filter(t => (breakdown[t.key] || 0) > 0);
    const hasData = active.length > 0;
    const textColor = getThemeColor('--text-secondary', '#94A3B8');
    const surfaceColor = getThemeColor('--surface', '#111820');

    renderChartInstance(canvasId, {
      type: 'doughnut',
      data: {
        labels: hasData ? active.map(t => t.label) : ['No Data'],
        datasets: [{
          data: hasData ? active.map(t => breakdown[t.key]) : [1],
          backgroundColor: hasData ? active.map(t => t.color) : ['#334155'],
          borderWidth: 2,
          borderColor: surfaceColor,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              font: { family: 'Inter', size: 12 },
              padding: 14,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            }
          }
        }
      }
    });
  }

  function reloadCharts() {
    if (_monthlyData) {
      drawMonthlyChart('of-monthly-chart', _monthlyData);
      drawMonthlyChart('of-reports-monthly-chart', _monthlyData);
    }
    if (_summaryBreakdownData) {
      drawBreakdownChart('of-breakdown-chart', _summaryBreakdownData);
      drawBreakdownChart('of-reports-breakdown-chart', _summaryBreakdownData);
    }
  }

  // ---------- 1. Fund Overview ----------

  async function loadOverview() {
    // Skeletons while data loads (same as the main portal)
    $('of-overview-stats').innerHTML = skeletonStatCards();
    $('of-overview-alerts').innerHTML = skeletonStack();
    $('of-overview-recent').innerHTML = skeletonStack();

    await refreshCoreData();
    const [summary, monthly] = await Promise.all([
      Api.reports.summary(),
      Api.reports.monthly()
    ]);

    _monthlyData = monthly;
    _summaryBreakdownData = summary.breakdown;

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
      <div class="of-stat">
        <div class="of-stat-label"><span>Total Council Funds</span><iconify-icon icon="solar:info-circle-linear"></iconify-icon></div>
        <div class="of-stat-value">₱${fmtNum(total)}</div>
        <div class="of-stat-sub">Available + Reserved Envelopes</div>
        <div class="stat-popover">
          <div class="stat-pop-row income"><span>Available Cash</span> <span>₱${fmtNum(summary.remainingBalance)}</span></div>
          <div class="stat-pop-row" style="color:var(--status-neutral)"><span>Reserved (Events)</span> <span>₱${fmtNum(reserved)}</span></div>
          <div class="stat-pop-row total"><span>Total Council Net</span> <span>₱${fmtNum(total)}</span></div>
        </div>
      </div>
      <div class="of-stat is-green">
        <div class="of-stat-label"><span>General Fund Available</span><iconify-icon icon="solar:info-circle-linear"></iconify-icon></div>
        <div class="of-stat-value">₱${fmtNum(summary.remainingBalance)}</div>
        <div class="of-stat-sub">Unreserved cash</div>
        <div class="stat-popover">
          <div class="stat-pop-row income"><span>Total Income</span> <span>₱${fmtNum(summary.totalIncome)}</span></div>
          <div class="stat-pop-row expense"><span>Misc Expenses</span> <span>-₱${fmtNum(summary.generalExpense || 0)}</span></div>
          <div class="stat-pop-row" style="color:var(--status-neutral)"><span>Event Allocations</span> <span>-₱${fmtNum(reserved)}</span></div>
          <div class="stat-pop-row total"><span>Available Fund</span> <span>₱${fmtNum(summary.remainingBalance)}</span></div>
        </div>
      </div>
      <div class="of-stat">
        <div class="of-stat-label"><span>Reserved in Events</span><iconify-icon icon="solar:info-circle-linear"></iconify-icon></div>
        <div class="of-stat-value">₱${fmtNum(reserved)}</div>
        <div class="of-stat-sub">${_events.filter(e => e.status !== 'archived').length} active events</div>
        <div class="stat-popover">
          ${_events.filter(e => e.status !== 'archived').slice(0, 5).map(e => `
            <div class="stat-pop-row"><span>${esc(e.event_name)}</span> <span>₱${fmtNum(e.allocated_budget)}</span></div>
          `).join('')}
          <div class="stat-pop-row total"><span>Total Envelopes</span> <span>₱${fmtNum(reserved)}</span></div>
        </div>
      </div>
      <div class="of-stat ${mtdIn - mtdOut >= 0 ? 'is-green' : 'is-red'}">
        <div class="of-stat-label"><span>This Month, Net</span><iconify-icon icon="solar:info-circle-linear"></iconify-icon></div>
        <div class="of-stat-value">${mtdIn - mtdOut >= 0 ? '+' : '-'}₱${fmtNum(Math.abs(mtdIn - mtdOut))}</div>
        <div class="of-stat-sub">In ₱${fmtNum(mtdIn)} · Out ₱${fmtNum(mtdOut)}</div>
        <div class="stat-popover">
          <div class="stat-pop-row income"><span>Month Inflow</span> <span>+₱${fmtNum(mtdIn)}</span></div>
          <div class="stat-pop-row expense"><span>Month Outflow</span> <span>-₱${fmtNum(mtdOut)}</span></div>
          <div class="stat-pop-row total"><span>Month Net Position</span> <span>${mtdIn - mtdOut >= 0 ? '+' : '-'}₱${fmtNum(Math.abs(mtdIn - mtdOut))}</span></div>
        </div>
      </div>
    `;

    bindStatPopovers();

    // Render Overview Charts
    requestAnimationFrame(() => {
      drawMonthlyChart('of-monthly-chart', monthly);
      drawBreakdownChart('of-breakdown-chart', summary.breakdown);
    });

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
            <span><strong>${esc(ev.event_name)}</strong></span>
            <strong>${over ? `OVER by ₱${fmtNum(spent - budget)}` : `${fmtNum(((spent / budget) * 100))}% used`}</strong>
          </div>`;
        }).join('')
      : '<div class="of-alert-item" style="color:var(--text-secondary);">No budget alerts. All events are in healthy range.</div>';

    const recent = (_txs || []).slice(0, 8);
    $('of-overview-recent').innerHTML = recent.length
      ? recent.map(tx => `
          <div class="of-recent-item">
            <div>
              <div style="font-weight:600;">${esc(tx.description)}</div>
              <span class="of-when">${UI.dateStr(tx.transaction_date)} · ${esc(tx.type)}</span>
            </div>
            <span class="${tx.type === 'expense' ? 'is-neg' : 'is-pos'}">${tx.type === 'expense' ? '-' : '+'}₱${fmtNum(tx.amount)}</span>
          </div>`).join('')
      : '<div class="of-recent-item" style="color:var(--text-secondary);">No transactions recorded yet.</div>';
  }

  function bindStatPopovers() {
    document.querySelectorAll('.of-stat').forEach(card => {
      card.addEventListener('mouseenter', () => card.classList.add('hover-active'));
      card.addEventListener('mouseleave', () => card.classList.remove('hover-active'));
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = card.classList.contains('hover-active');
        document.querySelectorAll('.of-stat').forEach(c => c.classList.remove('hover-active'));
        if (!active) card.classList.add('hover-active');
      });
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.of-stat').forEach(c => c.classList.remove('hover-active'));
    });
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
      if (!eventSel.value) {
        errEl.textContent = 'Please select an event.';
        errEl.classList.remove('hidden');
        return;
      }
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
      Remaining: <strong style="color:${over || rem < 0 ? 'var(--status-negative)' : 'var(--status-positive)'}">₱${fmtNum(rem)}</strong>
      ${over ? '<br/><em style="color:var(--status-negative)">This event is over budget.</em>' : ''}
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
    Dropdowns.syncAll();
  }

  // ---------- 3. Events & Budgets ----------

  function bindEventFilters() {
    const searchInput = $('of-events-search');
    const sortSelect  = $('of-events-sort');
    const filterTabs  = $('of-events-filter-tabs');

    if (searchInput) searchInput.addEventListener('input', () => renderEventsGrid());
    if (sortSelect)  sortSelect.addEventListener('change', () => renderEventsGrid());
    if (filterTabs) {
      filterTabs.querySelectorAll('.of-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          _eventStatusFilter = btn.dataset.status;
          filterTabs.querySelectorAll('.of-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
          renderEventsGrid();
        });
      });
    }
  }

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
        <div><div style="font-size:0.68rem;text-transform:uppercase;color:var(--text-tertiary)">From</div><strong>${fromSel.value === 'GENERAL' ? 'General Fund' : esc(_events.find(e => e.id === fromSel.value)?.event_name || '')}</strong> · ${fmt(fromSel.value)}</div>
        <div style="text-align:right"><div style="font-size:0.68rem;text-transform:uppercase;color:var(--text-tertiary)">To</div><strong>${esc(_events.find(e => e.id === toSel.value)?.event_name || '')}</strong> · ${fmt(toSel.value)}</div>`;
    };
    fromSel.addEventListener('change', updatePreview);
    toSel.addEventListener('change', updatePreview);
    amountIn.addEventListener('input', updatePreview);

    $('of-transfer-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-transfer-error');
      errEl.classList.add('hidden');
      if (!fromSel.value || !toSel.value) {
        errEl.textContent = 'Please choose both the source and target events.';
        errEl.classList.remove('hidden');
        return;
      }
      if (fromSel.value === toSel.value) {
        errEl.textContent = 'Source and target must be different events.';
        errEl.classList.remove('hidden');
        return;
      }
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
    $('of-events-grid').innerHTML = skeletonEventCards();
    const opts = '<option value="">Select Event</option>' +
      activeEvents().map(ev => `<option value="${ev.id}">${esc(ev.event_name)}</option>`).join('');
    $('of-transfer-from').innerHTML = '<option value="GENERAL">GENERAL FUND</option>' + opts;
    $('of-transfer-to').innerHTML   = opts;
    Dropdowns.syncAll();
    await renderEventsGrid();
  }

  async function renderEventsGrid() {
    await refreshCoreData();
    const grid = $('of-events-grid');
    const searchVal = ($('of-events-search')?.value || '').toLowerCase();
    const sortVal = $('of-events-sort')?.value || 'newest';

    let list = activeEvents();

    if (_eventStatusFilter !== 'all') {
      list = list.filter(e => e.status === _eventStatusFilter);
    }

    if (searchVal) {
      list = list.filter(e =>
        e.event_name.toLowerCase().includes(searchVal) ||
        (e.description || '').toLowerCase().includes(searchVal)
      );
    }

    list.sort((a, b) => {
      if (sortVal === 'name-asc') {
        return a.event_name.localeCompare(b.event_name);
      } else if (sortVal === 'budget-desc') {
        return Number(b.allocated_budget) - Number(a.allocated_budget);
      } else if (sortVal === 'budget-asc') {
        return Number(a.allocated_budget) - Number(b.allocated_budget);
      } else {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });

    grid.innerHTML = list.length ? list.map(ev => {
      const budget = Number(ev.allocated_budget) || 0;
      const spent  = Number(ev.computed_expenses) || 0;
      const over   = budget > 0 && spent > budget;
      const pct    = over ? 100 : (budget > 0 ? Math.min((spent / budget) * 100, 100) : 0);
      return `
        <div class="of-event-card" data-ev="${ev.id}">
          ${UI.renderStatusBadge(ev.status)}
          <h4>${esc(ev.event_name)}</h4>
          ${ev.event_date ? `<div class="of-event-date"><iconify-icon icon="solar:calendar-date-linear"></iconify-icon> ${UI.dateStr(ev.event_date)}</div>` : ''}
          <p>${esc(ev.description || 'No description provided.')}</p>
          <div class="of-budget-bar"><div class="of-budget-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
          <div class="of-budget-labels"><span>Spent ₱${fmtNum(spent)}</span><span>Alloc ₱${fmtNum(budget)}</span></div>
          ${over ? `<div class="of-over-note">Over budget by ₱${fmtNum(spent - budget)}</div>` : ''}
          <div class="of-event-actions">
            <button class="of-btn of-btn-ghost" data-act="detail">Manage</button>
            ${ev.status !== 'completed' && ev.status !== 'archived' ? '<button class="of-btn of-btn-ghost" data-act="complete">Complete</button>' : ''}
            ${ev.status !== 'archived'
              ? '<button class="of-btn of-btn-ghost" data-act="archive">Archive</button>'
              : '<button class="of-btn of-btn-ghost" data-act="restore">Restore</button>'}
          </div>
        </div>`;
    }).join('') : '<p style="color:var(--text-secondary);font-size:0.85rem">No matching events found.</p>';

    grid.querySelectorAll('.of-event-card').forEach(card => {
      const ev = _events.find(e => e.id === card.dataset.ev);
      if (!ev) return;
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
      <div class="of-card" style="margin-top:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
          <div>
            ${UI.renderStatusBadge(ev.status)}
            <h3 style="margin-top:0.5rem">${esc(ev.event_name)}</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary)">${esc(ev.description || 'No description.')}</p>
          </div>
          <button class="of-btn of-btn-ghost" id="of-detail-close">Close</button>
        </div>
        <div class="of-stat-grid" style="margin-top:1.25rem">
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
        <div id="of-detail-txs" class="of-scrollable-list" style="margin-top:1rem"></div>
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
      box.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary)">Loading history…</p>';
      try {
        const detail = await Api.events.get(ev.id);
        box.innerHTML = detail.transactions?.length
          ? detail.transactions.map(tx => `
              <div class="of-recent-item">
                <div>
                  <div style="font-weight:600;">${esc(tx.description)}</div>
                  <span class="of-when">${UI.dateStr(tx.transaction_date)} · ${esc(tx.type)}</span>
                </div>
                <div style="text-align:right">
                  <span class="${tx.type === 'expense' ? 'is-neg' : 'is-pos'}">${tx.type === 'expense' ? '-' : '+'}₱${fmtNum(tx.amount)}</span>
                  ${tx.receipt_url ? `<div><a class="receipt-link" href="${tx.receipt_url}" target="_blank" style="font-size:0.75rem;color:var(--accent);display:inline-flex;align-items:center;gap:2px;"><iconify-icon icon="solar:paperclip-linear"></iconify-icon> Receipt</a></div>` : ''}
                </div>
              </div>`).join('')
          : '<p style="font-size:0.8rem;color:var(--text-secondary)">No transactions for this event yet.</p>';
      } catch (err) {
        box.innerHTML = `<p style="font-size:0.8rem;color:var(--status-negative)">${esc(err.message)}</p>`;
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
    // Skeleton rows while data loads
    $('of-events-summary-table').querySelector('tbody').innerHTML = skeletonRows(5);
    $('of-audit-table').querySelector('tbody').innerHTML = skeletonRows(4);

    const [summary, monthly, eventsSummary] = await Promise.all([
      Api.reports.summary(),
      Api.reports.monthly(),
      Api.reports.eventsSummary()
    ]);
    _monthlyData = monthly;
    _summaryBreakdownData = summary.breakdown;

    requestAnimationFrame(() => {
      drawMonthlyChart('of-reports-monthly-chart', monthly);
      drawBreakdownChart('of-reports-breakdown-chart', summary.breakdown);
    });

    const tbody = $('of-events-summary-table').querySelector('tbody');
    tbody.innerHTML = eventsSummary.length ? eventsSummary.map(ev => `
      <tr>
        <td><strong>${esc(ev.event_name)}</strong></td>
        <td class="num">₱${fmtNum(ev.allocated_budget)}</td>
        <td class="num">₱${fmtNum((Number(ev.allocated_budget) || 0) + (Number(ev.computed_remaining) || 0) === 0 ? 0 : Math.max(0, (Number(ev.allocated_budget) || 0) - (Number(ev.computed_remaining) || 0)))}</td>
        <td class="num ${Number(ev.computed_remaining) < 0 ? 'is-neg' : 'is-pos'}">₱${fmtNum(ev.computed_remaining)}</td>
        <td>${UI.renderStatusBadge(ev.status)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5">No events found.</td></tr>';

    await loadAudit();
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
      const hay = `${l.profiles?.full_name || ''} ${l.action} ${humanizeAction(l.action)} ${JSON.stringify(l.details || {})}`.toLowerCase();
      return hay.includes(q);
    });
    const tbody = $('of-audit-table').querySelector('tbody');
    tbody.innerHTML = rows.length ? rows.map(log => `
      <tr>
        <td style="white-space:nowrap">${UI.dateStr(log.created_at)}</td>
        <td>${esc(log.profiles?.full_name || 'Unknown')}</td>
        <td>${auditActionCell(log.action)}</td>
        <td style="font-size:0.78rem;color:var(--text-secondary)">${esc(auditDetails(log))}</td>
      </tr>`).join('')
      : '<tr><td colspan="4">No matching audit entries.</td></tr>';
  }

  // Raw audit codes read like syntax - present them as plain sentences with
  // the same icon/color language the main system's admin panel uses.
  const AUDIT_ACTIONS = {
    CREATE_TRANSACTION:       { icon: 'solar:add-circle-linear',       color: '#22C55E', label: 'Created a transaction' },
    EDIT_TRANSACTION:         { icon: 'solar:pen-linear',              color: '#F97316', label: 'Edited a transaction' },
    DELETE_TRANSACTION:       { icon: 'solar:trash-bin-trash-linear',  color: '#ef4444', label: 'Deleted a transaction' },
    BULK_IMPORT_TRANSACTIONS: { icon: 'solar:upload-track-linear',     color: '#3b82f6', label: 'Bulk import' },
    CREATE_EVENT:             { icon: 'solar:calendar-add-linear',     color: '#22C55E', label: 'Created an event' },
    UPDATE_EVENT:             { icon: 'solar:calendar-date-linear',    color: '#F97316', label: 'Updated an event' },
    ARCHIVE_EVENT:            { icon: 'solar:box-minimalistic-linear', color: '#8b5cf6', label: 'Archived an event' },
    POST_ANNOUNCEMENT:        { icon: 'solar:bell-linear',             color: '#f59e0b', label: 'Posted an announcement' },
    SET_USER_ROLE:            { icon: 'solar:shield-check-linear',     color: '#6366f1', label: 'Changed a user role' },
    BUDGET_TRANSFER:          { icon: 'solar:card-transfer-linear',    color: '#14b8a6', label: 'Transferred budget' },
    OVER_BUDGET_ALERT:        { icon: 'solar:danger-triangle-linear',  color: '#F59E0B', label: 'Over-budget alert' },
  };

  function humanizeAction(action) {
    const meta = AUDIT_ACTIONS[action];
    if (meta) return meta.label;
    return String(action || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function auditActionCell(action) {
    const meta = AUDIT_ACTIONS[action] || { icon: 'solar:info-circle-linear', color: 'var(--text-secondary)' };
    return `<div style="display:flex;align-items:center;gap:0.5rem;">
      <iconify-icon icon="${meta.icon}" style="font-size:14px;color:${meta.color}"></iconify-icon>
      <span>${esc(humanizeAction(action))}</span>
    </div>`;
  }

  function auditDetails(log) {
    const d = log.details || {};
    switch (log.action) {
      case 'BUDGET_TRANSFER':
        return `₱${fmtNum(d.amount)} from "${d.from_event_name || 'an event'}" to "${d.to_event_name || 'an event'}"${d.reason ? ` — reason: ${d.reason}` : ''}`;
      case 'SET_USER_ROLE':
        return `Set ${d.user_name || 'a user'}'s role to ${d.new_role || '—'}`;
      case 'CREATE_TRANSACTION':
        return `${d.type ? UI.capitalize(String(d.type)) + ' of ' : ''}₱${fmtNum(d.amount)}${d.description ? ` — "${d.description}"` : ''}`;
      case 'EDIT_TRANSACTION':
        return `Reason: ${d.reason || '—'}`;
      case 'DELETE_TRANSACTION':
        return `Deleted "${d.description || 'a transaction'}"${d.reason ? ` — reason: ${d.reason}` : ''}`;
      case 'BULK_IMPORT_TRANSACTIONS':
        return `Imported ${d.count || 0} transactions`;
      case 'CREATE_EVENT':
        return `Created "${d.event_name || 'an event'}" with a budget of ₱${fmtNum(d.allocated_budget)}`;
      case 'UPDATE_EVENT': {
        const changed = Array.isArray(d.changes)
          ? d.changes.filter(c => c !== 'updated_at').map(c => String(c).replace(/_/g, ' ')).join(', ')
          : (d.changes ? String(d.changes) : '');
        return `Updated "${d.event_name || 'an event'}"${changed ? ` — modified ${changed}` : ''}`;
      }
      case 'ARCHIVE_EVENT':
        return `Archived "${d.event_name || 'an event'}"`;
      case 'POST_ANNOUNCEMENT':
        return `Posted "${d.title || 'an announcement'}"`;
      case 'OVER_BUDGET_ALERT':
        return `Only ₱${fmtNum(d.remaining_budget)} remains on an event's allocation`;
      default:
        return summarizeDetails(d);
    }
  }

  function summarizeDetails(d = {}) {
    const parts = [];
    if (d.event_name)       parts.push(d.event_name);
    if (d.description)      parts.push(d.description);
    if (d.title)            parts.push(`"${d.title}"`);
    if (d.count)            parts.push(`${d.count} items`);
    if (d.changes) {
      const ch = Array.isArray(d.changes)
        ? d.changes.filter(c => c !== 'updated_at').map(c => c.replace(/_/g, ' ')).join(', ')
        : String(d.changes);
      if (ch) parts.push(`modified: ${ch}`);
    }
    if (d.reason)           parts.push(`reason: ${d.reason}`);
    if (d.user_name)        parts.push(`user: ${d.user_name}`);
    if (d.new_role)         parts.push(`role → ${d.new_role}`);
    if (d.amount != null)   parts.push(`₱${fmtNum(d.amount)}`);
    if (d.from_event_name)  parts.push(`from ${d.from_event_name}`);
    if (d.to_event_name)    parts.push(`to ${d.to_event_name}`);
    if (!parts.length) {
      const keys = Object.keys(d).filter(k => k !== 'event_id' && k !== 'transaction_id').slice(0, 3);
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
    $('of-people-table').querySelector('tbody').innerHTML = skeletonRows(4);
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
        <td><strong>${esc(u.full_name)}</strong></td>
        <td style="font-size:0.78rem;color:var(--text-secondary)">${esc(u.email)}</td>
        <td>${UI.renderStatusBadge(u.role)}</td>
        <td style="${canAssign ? '' : 'display:none'}">
          ${canAssign && u.id !== _profile.id
            ? `<div style="display:flex;gap:0.4rem;align-items:center;">
                 <select data-role-for="${u.id}" style="padding:0.35rem;border:1px solid var(--border-default);border-radius:6px;font-size:0.78rem;background:var(--bg-surface-raised);color:var(--text-primary);">
                   ${assignableRoles().map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
                 </select>
                 <button class="of-btn of-btn-ghost" data-apply="${u.id}" style="padding:0.3rem 0.65rem;font-size:0.74rem">Apply</button>
               </div>`
            : (u.id === _profile.id ? '<span style="color:var(--text-tertiary);font-size:0.75rem">You</span>' : '—')}
        </td>
      </tr>`).join('')
      : '<tr><td colspan="4">No matching people found.</td></tr>';

    // Rows are re-created on every render - bind the animated dropdowns to
    // the freshly injected role selects (bindDropdown skips already-bound ones)
    tbody.querySelectorAll('[data-role-for]').forEach(sel => Dropdowns.bindDropdown(sel));

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
    $('of-announce-list').innerHTML = skeletonStack(2);
    const list = await Api.request('GET', '/announcements');
    $('of-announce-list').innerHTML = list.length ? list.map(a => `
      <div class="of-announce-item">
        <strong>${esc(a.title)}</strong>
        <p>${esc(a.body)}</p>
        <span class="of-when">${UI.dateStr(a.created_at)}</span>
      </div>`).join('')
      : '<p style="font-size:0.82rem;color:var(--text-secondary)">No announcements yet.</p>';
  }

  // ---------- Start ----------

  document.addEventListener('DOMContentLoaded', boot);

  return { boot };
})();
