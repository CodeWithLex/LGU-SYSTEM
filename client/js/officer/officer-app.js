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
  const _eventDetailCache = new Map();

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

  // Skeleton placeholders matching the main student portal
  function skeletonStack(lines = 3) {
    const rows = Array.from({ length: lines }, (_, i) =>
      `<div class="sk-bone sk-list-row" style="height:${i === 0 ? '16px' : '12px'};width:${i === lines - 1 ? '60%' : '100%'};margin-bottom:0.5rem;"></div>`).join('');
    return `<div class="sk-content-card" style="padding:1rem;gap:0.5rem;" role="status" aria-label="Loading">${rows}</div>`;
  }

  function skeletonRows(colspan, rows = 4) {
    return Array.from({ length: rows }, () =>
      `<tr><td colspan="${colspan}"><div class="sk-bone sk-list-row" style="height:16px;margin:0.45rem 0;"></div></td></tr>`).join('');
  }

  function skeletonStatCards(n = 4) {
    return Array.from({ length: n }, () => `
      <div class="sk-stat-card">
        <div class="sk-bone sk-circle" style="width:38px;height:38px;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <div class="sk-bone" style="height:10px;width:60%;border-radius:4px;"></div>
          <div class="sk-bone" style="height:22px;width:80%;border-radius:5px;"></div>
        </div>
      </div>
    `).join('');
  }

  function skeletonEventCards(n = 6) {
    return Array.from({ length: n }, () => `
      <div class="sk-content-card" style="min-height:190px;padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
          <div class="sk-bone" style="height:16px;width:50%;border-radius:4px;"></div>
          <div class="sk-bone" style="height:14px;width:20%;border-radius:100px;"></div>
        </div>
        <div class="sk-bone" style="height:12px;width:80%;border-radius:4px;margin-bottom:0.5rem;"></div>
        <div class="sk-bone" style="height:12px;width:65%;border-radius:4px;margin-bottom:1rem;"></div>
        <div class="sk-bone" style="height:8px;width:100%;border-radius:999px;margin-bottom:0.75rem;"></div>
        <div style="display:flex;gap:0.5rem;margin-top:auto;">
          <div class="sk-bone" style="height:28px;flex:1;border-radius:6px;"></div>
          <div class="sk-bone" style="height:28px;flex:1;border-radius:6px;"></div>
        </div>
      </div>
    `).join('');
  }

  function getThemeColor(varName, fallback) {
    const color = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return color || fallback;
  }

  // ---------- Boot ----------

  async function boot() {
    const splash = document.getElementById('splash-screen');
    const splashStart = Date.now();
    if (splash) {
      const savedSection = window.location.hash.slice(1) || localStorage.getItem('officer_last_view') || 'overview';
      const shape = (['record', 'events', 'reports', 'people', 'announcements'].includes(savedSection)) ? 'list' : 'default';
      splash.classList.remove('splash-view-list', 'splash-view-default');
      splash.classList.add(`splash-view-${shape}`);
      splash.style.opacity = '1';
      splash.style.visibility = 'visible';
      splash.classList.remove('hidden');
    }

    if (!window.supabaseClient?.auth) {
      if (splash) splash.classList.add('hidden');
      return showGate('Authentication is unavailable. Check your internet connection and reload.');
    }

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
      if (splash) splash.classList.add('hidden');
      return showGate('Please log in through the main system first.');
    }
    window._authToken = session.access_token;

    const { data: { user } } = await window.supabaseClient.auth.getUser();
    if (!user) {
      if (splash) splash.classList.add('hidden');
      return showGate('Session expired. Log in again through the main system.');
    }

    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('role, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (!profile || !OFFICER_ROLES.includes(profile.role)) {
      if (splash) splash.classList.add('hidden');
      return showGate('This portal is for council officers only. Ask an admin or governor to assign you an officer role.');
    }

    _profile = profile;

    // Header identity
    const name = profile.full_name || user.email;
    const roleLabel = ROLE_LABELS[profile.role] || profile.role;
    $('of-user-name').textContent = name;
    $('of-user-role').textContent = roleLabel;
    if ($('of-mobile-user-role')) {
      $('of-mobile-user-role').textContent = roleLabel;
    }
    if (profile.avatar_url) {
      $('of-avatar').innerHTML = `<img src="${profile.avatar_url}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      $('of-avatar').textContent = (name[0] || '?').toUpperCase();
    }

    bindTheme();
    bindLogout();
    bindNav();
    Dropdowns.bindAll('#of-shell');
    if (typeof ProfileModal !== 'undefined') {
      ProfileModal.init();
    }
    bindRecordForm();
    bindEventForms();
    bindEventFilters();
    bindTransferForm();
    bindPeopleSearch();
    bindAuditSearch();
    bindAnnouncementForm();
    bindRosterForm();

    if (typeof Api !== 'undefined' && Api.prefetchAll) {
      Api.prefetchAll(profile.role);
    }

    document.addEventListener('transaction-updated', async () => {
      _eventDetailCache.clear();
      await refreshCoreData();
      const currentActive = document.querySelector('.of-view.active')?.id?.replace('of-view-', '');
      if (currentActive === 'overview') await loadOverview(true);
      if (currentActive === 'reports')  await loadReports(true);
      if (currentActive === 'events')   await renderEventsGrid();
      if (currentActive === 'people')   await loadPeople(true);
      if (currentActive === 'announcements') await loadAnnouncements(true);
    });

    document.addEventListener('api:cache-updated', async (e) => {
      const path = e.detail?.path || '';
      const currentActive = document.querySelector('.of-view.active')?.id?.replace('of-view-', '');
      if (path.startsWith('/reports') && (currentActive === 'overview' || currentActive === 'reports')) {
        if (currentActive === 'overview') await loadOverview(true);
        if (currentActive === 'reports')  await loadReports(true);
      } else if (path.startsWith('/events') && currentActive === 'events') {
        await renderEventsGrid();
      } else if (path.startsWith('/admin/users') && currentActive === 'people') {
        await loadPeople(true);
      }
    });

    $('of-shell').classList.remove('hidden');

    try {
      await refreshCoreData();
      const savedSection = window.location.hash.slice(1) || localStorage.getItem('officer_last_view') || 'overview';
      const validSections = ['overview', 'record', 'events', 'reports', 'people', 'announcements', 'roster'];
      const targetSection = validSections.includes(savedSection) ? savedSection : 'overview';
      await switchSection(targetSection);
    } catch (err) {
      toast('Could not load initial data: ' + err.message, 'error');
    } finally {
      if (splash) {
        const elapsed = Date.now() - splashStart;
        const remaining = Math.max(0, 300 - elapsed);
        setTimeout(() => {
          splash.style.opacity = '0';
          setTimeout(() => {
            splash.style.visibility = 'hidden';
            splash.classList.add('hidden');
          }, 300);
        }, remaining);
      }
    }
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    const validSections = ['overview', 'record', 'events', 'reports', 'people', 'announcements', 'roster'];
    if (validSections.includes(hash)) {
      switchSection(hash);
    }
  });

  function bindTheme() {
    const toggleBtns = document.querySelectorAll('[data-theme-toggle]');
    const updateIcon = () => {
      const currentTheme = localStorage.getItem('theme') || 'dark';
      const icon = currentTheme === 'dark' ? 'solar:sun-linear' : 'solar:moon-linear';
      const title = currentTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
      toggleBtns.forEach(btn => {
        const iconEl = btn.querySelector('iconify-icon');
        if (iconEl) iconEl.setAttribute('icon', icon);
        btn.setAttribute('title', title);
      });
    };

    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cur = localStorage.getItem('theme') || 'dark';
        const next = cur === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
        if (typeof UI !== 'undefined' && UI.syncThemeColor) UI.syncThemeColor(next);
        updateIcon();
        reloadCharts();
      });
    });
    updateIcon();
  }

  function bindLogout() {
    const handleLogout = async (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to sign out of the system?')) {
        try {
          await window.supabaseClient.auth.signOut();
        } catch (err) {
          console.error('Sign out error:', err);
        } finally {
          window.location.href = '/';
        }
      }
    };

    const mobileLogoutBtn = document.getElementById('of-mobile-logout-btn');
    const desktopLogoutBtn = document.getElementById('of-logout-btn');

    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);
    if (desktopLogoutBtn) desktopLogoutBtn.addEventListener('click', handleLogout);
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
    if (!section || !$(`of-view-${section}`)) section = 'overview';

    document.querySelectorAll('.of-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('[data-of]').forEach(b => b.classList.toggle('active', b.dataset.of === section));
    $(`of-view-${section}`).classList.add('active');

    // Remember view across page refreshes and keep URL hash in sync
    localStorage.setItem('officer_last_view', section);
    if (window.location.hash.slice(1) !== section) {
      history.replaceState(null, '', `#${section}`);
    }

    const isFirstLoad = !_loaded[section];

    try {
      if (section === 'overview')          { await loadOverview(!isFirstLoad); }
      else if (section === 'record')       { await loadRecord(); }
      else if (section === 'events')       { await loadEvents(!isFirstLoad); }
      else if (section === 'reports')      { await loadReports(!isFirstLoad); }
      else if (section === 'people')       { await loadPeople(!isFirstLoad); }
      else if (section === 'announcements') { await loadAnnouncements(!isFirstLoad); }
      else if (section === 'roster')       { await loadRoster(!isFirstLoad); }
    } catch (err) {
      if (isFirstLoad) toast(err.message || 'Failed to load section.', 'error');
    } finally {
      _loaded[section] = true;
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
      return new Date(y, mo - 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
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
              label: ctx => ` ${ctx.dataset.label}: ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
              afterBody: items => {
                const idx = items[0]?.dataIndex;
                if (idx == null || !monthly[idx]) return '';
                const net = (monthly[idx].income || 0) - (monthly[idx].expense || 0);
                return `Net: ${net >= 0 ? '+' : '-'}₱${Math.abs(net).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
              }
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

  async function loadOverview(isSilent = false) {
    if (!isSilent && !_loaded.overview) {
      $('of-overview-stats').innerHTML = skeletonStatCards();
      $('of-overview-alerts').innerHTML = skeletonStack();
      $('of-overview-recent').innerHTML = skeletonStack();
    }

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
            <div class="of-recent-main">
              <div class="of-recent-desc">${esc(tx.description)}</div>
              <span class="of-when">${UI.dateStr(tx.transaction_date)} · ${esc(tx.type)}</span>
            </div>
            <span class="${tx.type === 'expense' ? 'is-neg' : 'is-pos'}">${tx.type === 'expense' ? '-' : '+'}₱${fmtNum(tx.amount)}</span>
          </div>`).join('')
      : '<div class="of-recent-item" style="color:var(--text-secondary);">No transactions recorded yet.</div>';
  }

  function bindStatPopovers() {
    // On touch devices a tap fires a synthetic mouseenter before click, which
    // would open the popover and then let the click handler close it again —
    // so hover listeners are only bound when the device really supports hover.
    const canHover = window.matchMedia?.('(hover: hover)').matches;
    document.querySelectorAll('.of-stat').forEach(card => {
      if (canHover) {
        card.addEventListener('mouseenter', () => card.classList.add('hover-active'));
        card.addEventListener('mouseleave', () => card.classList.remove('hover-active'));
      }
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = card.classList.contains('hover-active');
        document.querySelectorAll('.of-stat').forEach(c => c.classList.remove('hover-active'));
        if (!active) {
          card.classList.add('hover-active');
          const popover = card.querySelector('.stat-popover');
          if (popover) {
            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth - 10) {
              popover.style.left = 'auto';
              popover.style.right = '0px';
            } else if (rect.left < 10) {
              popover.style.left = '0px';
              popover.style.right = 'auto';
            }
          }
        }
      });
    });
    if (!bindStatPopovers._docBound) {
      bindStatPopovers._docBound = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.of-stat').forEach(c => c.classList.remove('hover-active'));
      });
    }
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
        if (typeof Api !== 'undefined' && Api.invalidateCache) {
          Api.invalidateCache('/reports', '/transactions', '/dashboard', '/income', '/events');
        }
        await refreshCoreData();
        updateEventBalance();
        populateEventSelects();
        document.dispatchEvent(new CustomEvent('transaction-updated'));
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

  async function loadEvents(isSilent = false) {
    if (!isSilent && !_loaded.events) {
      $('of-events-grid').innerHTML = skeletonEventCards();
    }
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
    const modal = $('of-event-modal');
    const content = $('of-event-modal-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');

    content.innerHTML = `
      <div class="of-modal-head">
        <div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
            ${UI.renderStatusBadge(ev.status)}
            <span style="font-size:0.72rem;color:var(--text-tertiary);font-family:var(--font-mono, monospace);">ID: ${esc(ev.id.slice(0,8))}</span>
          </div>
          <h3>${esc(ev.event_name)}</h3>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin:0;">${esc(ev.description || 'No description provided.')}</p>
        </div>
        <button type="button" class="of-modal-close" id="of-detail-close" aria-label="Close dialog" title="Close">
          <iconify-icon icon="solar:close-circle-linear"></iconify-icon>
        </button>
      </div>

      <div class="of-modal-stats">
        <div class="of-modal-stat is-allocated">
          <span class="of-stat-label">Allocated</span>
          <span class="of-stat-value">₱${fmtNum(ev.allocated_budget)}</span>
        </div>
        <div class="of-modal-stat is-spent">
          <span class="of-stat-label">Spent</span>
          <span class="of-stat-value">₱${fmtNum(ev.computed_expenses)}</span>
        </div>
        <div class="of-modal-stat is-remaining">
          <span class="of-stat-label">Remaining</span>
          <span class="of-stat-value">₱${fmtNum(ev.computed_remaining)}</span>
        </div>
      </div>

      <form id="of-detail-form" class="of-form">
        <div class="of-form-row">
          <div class="of-field">
            <label><iconify-icon icon="solar:tag-linear" style="font-size:12px;margin-right:3px;vertical-align:middle;"></iconify-icon>Event Name</label>
            <input type="text" id="of-me-name" value="${esc(ev.event_name)}" required placeholder="Event name" />
          </div>
          <div class="of-field">
            <label><iconify-icon icon="solar:shield-check-linear" style="font-size:12px;margin-right:3px;vertical-align:middle;"></iconify-icon>Status</label>
            <select id="of-me-status">
              ${['upcoming','ongoing','completed','cancelled'].map(s => `<option value="${s}" ${ev.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="of-form-row">
          <div class="of-field">
            <label><iconify-icon icon="solar:wallet-money-linear" style="font-size:12px;margin-right:3px;vertical-align:middle;"></iconify-icon>Allocated Budget (₱)</label>
            <input type="number" id="of-me-budget" min="0" step="0.01" value="${ev.allocated_budget}" required placeholder="0.00" />
          </div>
          <div class="of-field">
            <label><iconify-icon icon="solar:calendar-date-linear" style="font-size:12px;margin-right:3px;vertical-align:middle;"></iconify-icon>Event Date</label>
            <input type="date" id="of-me-date" value="${ev.event_date || ''}" />
          </div>
        </div>
        <div class="of-field">
          <label><iconify-icon icon="solar:document-text-linear" style="font-size:12px;margin-right:3px;vertical-align:middle;"></iconify-icon>Description</label>
          <textarea id="of-me-desc" rows="2" placeholder="Brief event description">${esc(ev.description || '')}</textarea>
        </div>
        <div class="of-error hidden" id="of-me-error"></div>
        <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:center;margin-top:0.65rem;flex-wrap:wrap;">
          <button class="of-btn of-btn-ghost" type="button" id="of-detail-receipts">
            <iconify-icon icon="solar:history-linear"></iconify-icon> Transaction History <span style="font-size:0.75rem;background:var(--bg-surface);padding:0.15rem 0.45rem;border-radius:999px;border:1px solid var(--border-default);margin-left:0.3rem;" id="of-detail-tx-count">…</span>
          </button>
          <div style="display:flex;gap:0.6rem;">
            <button class="of-btn of-btn-ghost" type="button" id="of-detail-cancel">Cancel</button>
            <button class="of-btn of-btn-primary" type="submit" id="of-detail-save">Save Changes</button>
          </div>
        </div>
      </form>

      <div id="of-detail-txs" class="of-scrollable-list hidden" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-default);max-height:220px;"></div>
    `;

    // Bind custom animated dropdown to modal select
    Dropdowns.bindAll('#of-event-modal');

    const closeModal = () => {
      modal.classList.add('hidden');
    };

    $('of-detail-close').addEventListener('click', closeModal);
    $('of-detail-cancel').addEventListener('click', closeModal);

    // Dismiss when clicking backdrop
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // ESC key closes modal
    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);

    // Load tx count preview with instant cache check
    const countEl = $('of-detail-tx-count');
    const cachedDetail = _eventDetailCache.get(ev.id);
    if (cachedDetail && countEl) {
      countEl.textContent = cachedDetail.transactions?.length || 0;
    }

    Api.events.get(ev.id).then(detail => {
      _eventDetailCache.set(ev.id, detail);
      if (countEl) countEl.textContent = detail.transactions?.length || 0;
    }).catch(() => {});

    $('of-detail-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errEl = $('of-me-error');
      errEl.classList.add('hidden');
      const saveBtn = $('of-detail-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        await Api.events.update(ev.id, {
          event_name:       $('of-me-name').value,
          description:      $('of-me-desc').value,
          allocated_budget: $('of-me-budget').value,
          event_date:       $('of-me-date').value || null,
          status:           $('of-me-status').value
        });
        _eventDetailCache.delete(ev.id);
        toast('Event updated.', 'success');
        await refreshCoreData();
        await renderEventsGrid();
        closeModal();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    });

    $('of-detail-receipts').addEventListener('click', async () => {
      const box = $('of-detail-txs');
      if (!box.classList.contains('hidden')) {
        box.classList.add('hidden');
        return;
      }
      box.classList.remove('hidden');

      const renderList = (detail) => {
        box.innerHTML = detail.transactions?.length
          ? detail.transactions.map(tx => `
              <div class="of-recent-item">
                <div class="of-recent-main">
                  <div class="of-recent-desc">${esc(tx.description)}</div>
                  <span class="of-when">${UI.dateStr(tx.transaction_date)} · ${esc(tx.type)}</span>
                </div>
                <div style="text-align:right">
                  <span class="${tx.type === 'expense' ? 'is-neg' : 'is-pos'}">${tx.type === 'expense' ? '-' : '+'}₱${fmtNum(tx.amount)}</span>
                  ${tx.receipt_url ? `<div><a class="receipt-link" href="${tx.receipt_url}" target="_blank" style="font-size:0.75rem;color:var(--accent);display:inline-flex;align-items:center;gap:2px;"><iconify-icon icon="solar:paperclip-linear"></iconify-icon> Receipt</a></div>` : ''}
                </div>
              </div>`).join('')
          : '<p style="font-size:0.8rem;color:var(--text-secondary)">No transactions for this event yet.</p>';
      };

      const cached = _eventDetailCache.get(ev.id);
      if (cached) {
        renderList(cached);
      } else {
        box.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary)">Loading history…</p>';
      }

      try {
        const detail = await Api.events.get(ev.id);
        _eventDetailCache.set(ev.id, detail);
        renderList(detail);
      } catch (err) {
        if (!cached) {
          box.innerHTML = `<p style="font-size:0.8rem;color:var(--status-negative)">${esc(err.message)}</p>`;
        }
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

  async function loadReports(isSilent = false) {
    if (!isSilent && !_loaded.reports) {
      $('of-events-summary-table').querySelector('tbody').innerHTML = skeletonRows(5);
      $('of-audit-table').querySelector('tbody').innerHTML = skeletonRows(4);
    }

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
  let _auditCurrentPage = 1;
  const AUDIT_PAGE_SIZE = 10;

  async function loadAudit() {
    _auditRows = await Api.admin.auditLogs({ limit: 100 });
    _auditCurrentPage = 1;
    renderAuditTable();
  }

  function bindAuditSearch() {
    $('of-audit-search').addEventListener('input', () => {
      _auditCurrentPage = 1;
      renderAuditTable();
    });
  }

  function renderAuditTable() {
    const q = ($('of-audit-search').value || '').toLowerCase();
    const filtered = _auditRows.filter(l => {
      if (!q) return true;
      const hay = `${l.profiles?.full_name || ''} ${l.action} ${humanizeAction(l.action)} ${JSON.stringify(l.details || {})}`.toLowerCase();
      return hay.includes(q);
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
    if (_auditCurrentPage > totalPages) _auditCurrentPage = totalPages;
    if (_auditCurrentPage < 1) _auditCurrentPage = 1;

    const startIdx = (_auditCurrentPage - 1) * AUDIT_PAGE_SIZE;
    const pageRows = filtered.slice(startIdx, startIdx + AUDIT_PAGE_SIZE);

    const tbody = $('of-audit-table').querySelector('tbody');
    tbody.innerHTML = pageRows.length ? pageRows.map(log => `
      <tr>
        <td style="white-space:nowrap">${UI.dateStr(log.created_at)}</td>
        <td><strong>${esc(log.profiles?.full_name || 'Unknown')}</strong></td>
        <td>${auditActionCell(log.action)}</td>
        <td style="font-size:0.78rem;color:var(--text-secondary)">${esc(auditDetails(log))}</td>
      </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1.5rem;">No matching audit entries.</td></tr>';

    renderAuditPagination(filtered.length, totalPages);
  }

  function renderAuditPagination(totalItems, totalPages) {
    const pag = $('of-audit-pagination');
    if (!pag) return;
    if (totalItems <= AUDIT_PAGE_SIZE) {
      pag.innerHTML = `
        <span class="of-pagination-info">Showing all ${totalItems} entries</span>
        <div></div>
      `;
      return;
    }

    const start = (_auditCurrentPage - 1) * AUDIT_PAGE_SIZE + 1;
    const end = Math.min(_auditCurrentPage * AUDIT_PAGE_SIZE, totalItems);

    let pagesHTML = '';
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= _auditCurrentPage - 1 && p <= _auditCurrentPage + 1)) {
        pagesHTML += `<button type="button" class="of-page-btn ${p === _auditCurrentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
      } else if (p === _auditCurrentPage - 2 || p === _auditCurrentPage + 2) {
        pagesHTML += `<span style="color:var(--text-tertiary);padding:0 2px;font-size:0.8rem;">…</span>`;
      }
    }

    pag.innerHTML = `
      <span class="of-pagination-info">Showing ${start}–${end} of ${totalItems} entries</span>
      <div class="of-pagination-controls">
        <button type="button" class="of-page-btn" id="of-audit-prev" ${_auditCurrentPage <= 1 ? 'disabled' : ''}>
          <iconify-icon icon="solar:alt-arrow-left-linear"></iconify-icon> Prev
        </button>
        ${pagesHTML}
        <button type="button" class="of-page-btn" id="of-audit-next" ${_auditCurrentPage >= totalPages ? 'disabled' : ''}>
          Next <iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon>
        </button>
      </div>
    `;

    const prevBtn = $('of-audit-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (_auditCurrentPage > 1) {
        _auditCurrentPage--;
        renderAuditTable();
      }
    });

    const nextBtn = $('of-audit-next');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (_auditCurrentPage < totalPages) {
        _auditCurrentPage++;
        renderAuditTable();
      }
    });

    pag.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        _auditCurrentPage = Number(btn.dataset.page);
        renderAuditTable();
      });
    });
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

  async function loadPeople(isSilent = false) {
    if (!isSilent && !_loaded.people) {
      $('of-people-table').querySelector('tbody').innerHTML = skeletonRows(4);
    }
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
        await Api.announcements.create({
          title: $('of-announce-title').value,
          body:  $('of-announce-body').value
        });
        toast('Announcement posted.', 'success');
        e.target.reset();
        await loadAnnouncements(true);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Post Announcement';
      }
    });
  }

  async function loadAnnouncements(isSilent = false) {
    if (!isSilent && !_loaded.announcements) {
      $('of-announce-list').innerHTML = skeletonStack(2);
    }
    const list = await Api.announcements.list();
    $('of-announce-list').innerHTML = list.length ? list.map(a => `
      <div class="of-announce-item">
        <strong>${esc(a.title)}</strong>
        <p>${esc(a.body)}</p>
        <span class="of-when">${UI.dateStr(a.created_at)}</span>
      </div>`).join('')
      : '<p style="font-size:0.82rem;color:var(--text-secondary)">No announcements yet.</p>';
  }

  // ---------- Enrolled Roster Management ----------
  let _allRoster = [];

  function bindRosterForm() {
    const form = $('of-roster-form');
    if (!form) return;
    const errEl = $('of-roster-error');
    const btn = $('of-roster-submit');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (errEl) errEl.classList.add('hidden');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adding Student…';
      }

      try {
        const name = $('of-roster-name')?.value.trim();
        const sex = $('of-roster-sex')?.value;
        const course = $('of-roster-course')?.value;
        const year = $('of-roster-year')?.value;

        if (!name || !course || !year) throw new Error('Please fill in all required fields.');

        await Api.roster.create({ full_name: name, sex, course, year_level: year });
        toast(`Successfully added "${name}" to official enrolled roster!`, 'success');
        form.reset();

        // Clear local cache so instant search reflects new student
        if (window.Roster && window.Roster.getRoster) {
          window.Roster.getRoster().catch(() => {});
        }

        await loadRoster(true);
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Failed to add student to roster.';
          errEl.classList.remove('hidden');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Add Student to Roster';
        }
      }
    });

    const searchInput = $('of-roster-search');
    const programFilter = $('of-roster-filter-program');
    if (searchInput) searchInput.addEventListener('input', renderRosterTable);
    if (programFilter) programFilter.addEventListener('change', renderRosterTable);
  }

  async function loadRoster(isSilent = false) {
    const container = $('of-roster-table-container');
    if (!container) return;
    if (!isSilent && !_loaded.roster) {
      container.innerHTML = skeletonStack(3);
    }

    try {
      _allRoster = await Api.roster.list();
      renderRosterTable();
    } catch (err) {
      container.innerHTML = `<div class="of-error">Failed to load enrolled roster: ${esc(err.message)}</div>`;
    }
  }

  function renderRosterTable() {
    const container = $('of-roster-table-container');
    if (!container) return;

    const query = $('of-roster-search')?.value.toLowerCase().trim() || '';
    const program = $('of-roster-filter-program')?.value || '';

    const filtered = _allRoster.filter(s => {
      const matchName = !query || s.full_name.toLowerCase().includes(query);
      const matchProg = !program || s.course === program;
      return matchName && matchProg;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-secondary);padding:1rem;">No enrolled students found matching filter.</p>';
      return;
    }

    let html = `
      <div style="margin-bottom:0.75rem; font-weight:600; font-size:0.85rem; color:var(--text-secondary);">
        Total Enrolled Students: <span class="badge badge-primary">${filtered.length}</span>
      </div>
      <div class="of-table-wrap">
        <table class="of-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Gender</th>
              <th>Program</th>
              <th>Year Level</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    filtered.forEach(student => {
      const yrLabel = `${student.year_level}${student.year_level === '1' ? 'st' : student.year_level === '2' ? 'nd' : student.year_level === '3' ? 'rd' : 'th'} Year`;
      html += `
        <tr>
          <td><strong>${esc(student.full_name)}</strong></td>
          <td>${student.sex === 'F' ? 'Female' : 'Male'}</td>
          <td><span class="badge badge-info">${esc(student.course)}</span></td>
          <td>${yrLabel}</td>
          <td>
            <button class="of-btn of-btn-ghost delete-roster-btn" data-id="${student.id}" data-name="${esc(student.full_name)}" style="color:var(--col-danger); padding:0.25rem 0.5rem; font-size:0.8rem;">
              <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon> Delete
            </button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.delete-roster-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`Are you sure you want to remove "${name}" from the enrolled roster?`)) return;

        try {
          await Api.roster.delete(id);
          toast(`Removed "${name}" from enrolled roster.`, 'info');
          await loadRoster(true);
        } catch (err) {
          toast(`Failed to delete student: ${err.message}`, 'error');
        }
      });
    });
  }

  // ---------- Start ----------

  document.addEventListener('DOMContentLoaded', boot);

  return { boot };
})();
