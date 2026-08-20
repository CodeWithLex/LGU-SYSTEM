// =============================================
// client/js/reports.js — Phase 3 Reporting
// =============================================

let _monthlyChart = null;
let _breakdownChart = null;

async function initReports() {
  const container = document.getElementById('reports-content');
  if (!container) return;

  container.innerHTML = `<div class="loading-state">Loading reports…</div>`;

  try {
    const [summary, monthly, events] = await Promise.all([
      Api.reports.summary(),
      Api.reports.monthly(),
      Api.reports.eventsSummary(),
    ]);

    container.innerHTML = buildReportsHTML(summary, monthly, events);

    // CRITICAL: re-create Lucide icons after dynamic HTML injection
// Render charts after DOM is ready
    requestAnimationFrame(() => {
      renderMonthlyChart(monthly);
      renderBreakdownChart(summary.breakdown);
    });

    // Wire up download buttons
    container.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', () => downloadReport('pdf', btn.dataset.pdf, btn.dataset.name));
    });
    container.querySelectorAll('[data-excel]').forEach(btn => {
      btn.addEventListener('click', () => downloadReport('excel', btn.dataset.excel, btn.dataset.name));
    });

  } catch (err) {
    const isSessionErr = err.message.includes('session');
    container.innerHTML = `
      <div class="empty-state">
        <iconify-icon icon="icon-park-outline:caution" style="font-size:48px; color:var(--col-danger); margin-bottom:1rem" ></iconify-icon>
        <p style="font-size:1.1rem;font-weight:600;margin-bottom:0.5rem;">${isSessionErr ? 'Session Expired' : 'Failed to Load Reports'}</p>
        <p style="color:var(--col-text-muted);margin-bottom:1.5rem;max-width:300px;margin-left:auto;margin-right:auto;">
          ${err.message}
        </p>
        ${isSessionErr 
          ? `<button class="btn btn-primary" onclick="Auth.logout()">Sign In Again</button>` 
          : `<button class="btn btn-ghost" onclick="Reports.load()">Retry</button>`}
      </div>`;
}
}

function fmt(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function buildReportsHTML(summary, monthly, events) {
  const utilized = summary.totalIncome > 0
    ? Math.round((summary.totalExpense / summary.totalIncome) * 100)
    : 0;

  return `
    <!-- Summary Cards -->
    <div class="stats-grid" style="margin-bottom:2rem;">
      <div class="stat-card stat-income">
        <div class="stat-icon"><iconify-icon icon="icon-park-outline:trend-two"></iconify-icon></div>
        <div class="stat-body"><p class="stat-label">Total Income</p><h3 class="stat-value">${fmt(summary.totalIncome)}</h3></div>
      </div>
      <div class="stat-card stat-expense">
        <div class="stat-icon"><iconify-icon icon="icon-park-outline:trending-down"></iconify-icon></div>
        <div class="stat-body"><p class="stat-label">Total Expenses</p><h3 class="stat-value">${fmt(summary.totalExpense)}</h3></div>
      </div>
      <div class="stat-card stat-balance">
        <div class="stat-icon"><iconify-icon icon="icon-park-outline:wallet-one"></iconify-icon></div>
        <div class="stat-body"><p class="stat-label">Net Balance</p><h3 class="stat-value">${fmt(summary.remainingBalance)}</h3></div>
      </div>
      <div class="stat-card stat-donations">
        <div class="stat-icon"><iconify-icon icon="icon-park-outline:percentage"></iconify-icon></div>
        <div class="stat-body"><p class="stat-label">Budget Utilized</p><h3 class="stat-value">${utilized}%</h3></div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="dashboard-grid" style="margin-bottom:2rem;">
      <div class="dashboard-card">
        <h3><iconify-icon icon="icon-park-outline:chart-histogram" style="font-size:1rem; margin-right:.4rem; vertical-align:middle" ></iconify-icon>Monthly Income vs Expenses</h3>
        <div style="position:relative;height:260px;">
          <canvas id="monthly-chart"></canvas>
        </div>
      </div>
      <div class="dashboard-card">
        <h3><iconify-icon icon="icon-park-outline:chart-pie" style="font-size:1rem; margin-right:.4rem; vertical-align:middle" ></iconify-icon>Breakdown by Type</h3>
        <div style="position:relative;height:260px;">
          <canvas id="breakdown-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- Event Reports Table -->
    <div class="dashboard-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h3 style="margin:0;"><iconify-icon icon="icon-park-outline:file-text" style="font-size:1rem; margin-right:.4rem; vertical-align:middle" ></iconify-icon>Export Per-Event Reports</h3>
        <span style="font-size:.8rem;color:var(--text-secondary);">Admin only</span>
      </div>
      ${events.length === 0
        ? `<div class="empty-state"><iconify-icon icon="icon-park-outline:info"></iconify-icon> No events found.</div>`
        : `<div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Allocated</th>
                <th>Remaining</th>
                <th>Status</th>
                <th style="text-align:center;">Export</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(ev => `
                <tr>
                  <td><strong>${ev.event_name}</strong></td>
                  <td>${fmt(ev.allocated_budget)}</td>
                  <td>${fmt(ev.computed_remaining || 0)}</td>
                  <td>${UI.renderStatusBadge(ev.status)}</td>
                  <td style="text-align:center;">
                    <div style="display:inline-flex;gap:.5rem;">
                      <button class="tx-action-btn admin-only" style="font-size:.8rem;padding:.35rem .8rem;"
                        data-pdf="${ev.id}" data-name="${ev.event_name}">
                        <iconify-icon icon="icon-park-outline:file-text" style="font-size:.85rem; margin-right:.3rem" ></iconify-icon>PDF
                      </button>
                      <button class="tx-action-btn admin-only" style="font-size:.8rem;padding:.35rem .8rem;"
                        data-excel="${ev.id}" data-name="${ev.event_name}">
                        <iconify-icon icon="icon-park-outline:table" style="font-size:.85rem; margin-right:.3rem" ></iconify-icon>Excel
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <!-- Mobile View Cards -->
        <div class="mobile-cards-container">
          ${events.map(ev => `
            <div class="data-card">
              <div class="data-card-header">
                <strong style="font-size:1rem;color:var(--text-primary);">${ev.event_name}</strong>
                ${UI.renderStatusBadge(ev.status)}
              </div>
              
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.25rem;">
                <div>
                  <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Allocated</div>
                  <div style="font-size:0.9rem;font-weight:600;">${fmt(ev.allocated_budget)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;font-weight:700;">Remaining</div>
                  <div style="font-size:1.1rem;font-weight:800;color:var(--text-primary);">${fmt(ev.computed_remaining || 0)}</div>
                </div>
              </div>

              <div class="data-card-actions" style="margin-top:1rem;padding-top:0.5rem;gap:0.4rem;">
                <button class="tx-action-btn admin-only" style="padding:0.4rem 0.75rem;font-size:0.8rem;" data-pdf="${ev.id}" data-name="${ev.event_name}">
                  <iconify-icon icon="icon-park-outline:file-text"></iconify-icon> PDF
                </button>
                <button class="tx-action-btn admin-only" style="padding:0.4rem 0.75rem;font-size:0.8rem;" data-excel="${ev.id}" data-name="${ev.event_name}">
                  <iconify-icon icon="icon-park-outline:table"></iconify-icon> Excel
                </button>
              </div>
            </div>
          `).join('')}
        </div>`
      }
    </div>
  `;
}

function renderMonthlyChart(monthly) {
  const canvas = document.getElementById('monthly-chart');
  if (!canvas || !window.Chart) return;
  if (_monthlyChart) _monthlyChart.destroy();

  const labels  = monthly.map(m => {
    const [y, mo] = m.month.split('-');
    return new Date(y, mo - 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
  });

  _monthlyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: monthly.map(m => m.income),
          backgroundColor: '#F97316', /* engineering orange — income bars */
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
        legend: { position: 'top', labels: { color: '#94A3B8', font: { family: 'Inter' } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { color: '#94A3B8' }
        },
        y: {
          grid: { color: '#28313A' },
          ticks: {
            color: '#94A3B8',
            callback: v => `₱${(v / 1000).toFixed(0)}k`
          }
        }
      }
    }
  });
}

function renderBreakdownChart(breakdown) {
  const canvas = document.getElementById('breakdown-chart');
  if (!canvas || !window.Chart) return;
  if (_breakdownChart) _breakdownChart.destroy();

  // Fixed order so colors always match the right type
  const typeMap = [
    { key: 'expense',    label: 'Expenses',   color: '#EF4444' },
    { key: 'allocation', label: 'Allocation', color: '#94A3B8' },
    { key: 'donation',   label: 'Donations',  color: '#22C55E' },
    { key: 'collection', label: 'Collection', color: '#F97316' },
  ];

  // Filter out zero-value types so the chart isn't cluttered
  const active = typeMap.filter(t => (breakdown[t.key] || 0) > 0);
  const hasData = active.length > 0;

  _breakdownChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: hasData ? active.map(t => t.label) : ['No Data'],
      datasets: [{
        data: hasData ? active.map(t => breakdown[t.key]) : [1],
        backgroundColor: hasData ? active.map(t => t.color) : ['#334155'],
        borderWidth: 2,
        borderColor: '#111820',
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
            color: '#94A3B8',
            font: { family: 'Inter', size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8
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

async function downloadReport(type, eventId, eventName) {
  const token = window._authToken;
  if (!token) { alert('Please log in again.'); return; }

  const btn = document.querySelector(`[data-${type}="${eventId}"]`);
  const originalHTML = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.innerHTML = 'Generating…'; }

  try {
    const BASE = window.API_BASE || '';
    const res = await fetch(`${BASE}/api/reports/${type}/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `LGU-Report-${eventName.replace(/\s+/g, '-')}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Download failed: ${err.message}`);
  } finally {
    if (btn && originalHTML) { btn.disabled = false; btn.innerHTML = originalHTML; }
}
}

// Export global namespace for app.js navigation
window.Reports = { load: initReports };
