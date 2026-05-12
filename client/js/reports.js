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
    if (window.lucide) lucide.createIcons();

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
    container.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i> Failed to load reports. ${err.message}</div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
        <div class="stat-icon"><i data-lucide="trending-up"></i></div>
        <div class="stat-body"><p class="stat-label">Total Income</p><h3 class="stat-value">${fmt(summary.totalIncome)}</h3></div>
      </div>
      <div class="stat-card stat-expense">
        <div class="stat-icon"><i data-lucide="trending-down"></i></div>
        <div class="stat-body"><p class="stat-label">Total Expenses</p><h3 class="stat-value">${fmt(summary.totalExpense)}</h3></div>
      </div>
      <div class="stat-card stat-balance">
        <div class="stat-icon"><i data-lucide="wallet"></i></div>
        <div class="stat-body"><p class="stat-label">Net Balance</p><h3 class="stat-value">${fmt(summary.remainingBalance)}</h3></div>
      </div>
      <div class="stat-card stat-donations">
        <div class="stat-icon"><i data-lucide="percent"></i></div>
        <div class="stat-body"><p class="stat-label">Budget Utilized</p><h3 class="stat-value">${utilized}%</h3></div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="dashboard-grid" style="margin-bottom:2rem;">
      <div class="dashboard-card">
        <h3><i data-lucide="bar-chart-2" style="width:1rem;height:1rem;margin-right:.4rem;vertical-align:middle;"></i>Monthly Income vs Expenses</h3>
        <div style="position:relative;height:260px;">
          <canvas id="monthly-chart"></canvas>
        </div>
      </div>
      <div class="dashboard-card">
        <h3><i data-lucide="pie-chart" style="width:1rem;height:1rem;margin-right:.4rem;vertical-align:middle;"></i>Breakdown by Type</h3>
        <div style="position:relative;height:260px;">
          <canvas id="breakdown-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- Event Reports Table -->
    <div class="dashboard-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h3 style="margin:0;"><i data-lucide="file-text" style="width:1rem;height:1rem;margin-right:.4rem;vertical-align:middle;"></i>Export Per-Event Reports</h3>
        <span style="font-size:.8rem;color:var(--col-text-muted);">Admin only</span>
      </div>
      ${events.length === 0
        ? `<div class="empty-state"><i data-lucide="info"></i> No events found.</div>`
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
                  <td>${fmt(ev.remaining_budget)}</td>
                  <td><span class="status-badge status-${ev.status}">${ev.status}</span></td>
                  <td style="text-align:center;">
                    <div style="display:inline-flex;gap:.5rem;">
                      <button class="btn btn-ghost admin-only" style="font-size:.8rem;padding:.35rem .8rem;"
                        data-pdf="${ev.id}" data-name="${ev.event_name}">
                        <i data-lucide="file-text" style="width:.85rem;height:.85rem;margin-right:.3rem;"></i>PDF
                      </button>
                      <button class="btn btn-ghost admin-only" style="font-size:.8rem;padding:.35rem .8rem;color:#10b981;"
                        data-excel="${ev.id}" data-name="${ev.event_name}">
                        <i data-lucide="sheet" style="width:.85rem;height:.85rem;margin-right:.3rem;"></i>Excel
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
                <strong style="font-size:1rem;color:var(--col-text);">${ev.event_name}</strong>
                <span class="status-badge status-${ev.status}">${UI.capitalize(ev.status)}</span>
              </div>
              
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.25rem;">
                <div>
                  <div style="font-size:0.65rem;color:var(--col-text-muted);text-transform:uppercase;font-weight:700;">Allocated</div>
                  <div style="font-size:0.9rem;font-weight:600;">${fmt(ev.allocated_budget)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:0.65rem;color:var(--col-text-muted);text-transform:uppercase;font-weight:700;">Remaining</div>
                  <div style="font-size:1.1rem;font-weight:800;color:var(--col-primary);">${fmt(ev.remaining_budget)}</div>
                </div>
              </div>

              <div class="data-card-actions" style="margin-top:1rem;padding-top:0.5rem;gap:0.4rem;">
                <button class="btn btn-ghost admin-only" style="padding:0.4rem 0.75rem;font-size:0.8rem;" data-pdf="${ev.id}" data-name="${ev.event_name}">
                  <i data-lucide="file-text"></i> PDF
                </button>
                <button class="btn btn-ghost admin-only" style="padding:0.4rem 0.75rem;font-size:0.8rem;color:#10b981;" data-excel="${ev.id}" data-name="${ev.event_name}">
                  <i data-lucide="sheet"></i> Excel
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
          backgroundColor: 'rgba(16,185,129,0.75)',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Expenses',
          data: monthly.map(m => m.expense),
          backgroundColor: 'rgba(239,68,68,0.75)',
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Inter' } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: {
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
    { key: 'expense',    label: 'Expenses',   color: '#ef4444' },
    { key: 'allocation', label: 'Allocation', color: '#6384ff' },
    { key: 'donation',   label: 'Donations',  color: '#10b981' },
    { key: 'collection', label: 'Collection', color: '#f59e0b' },
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
        borderColor: 'rgba(255,255,255,0.08)',
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
            font: { family: 'Inter', size: 12 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10
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
    if (window.lucide) lucide.createIcons();
  }
}

// Export global namespace for app.js navigation
window.Reports = { load: initReports };
