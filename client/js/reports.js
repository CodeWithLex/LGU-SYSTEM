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
      Api.get('/api/reports/summary'),
      Api.get('/api/reports/monthly'),
      Api.get('/api/reports/events-summary'),
    ]);

    container.innerHTML = buildReportsHTML(summary, monthly, events);

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
    container.innerHTML = `<div class="empty-state">⚠️ Failed to load reports. ${err.message}</div>`;
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
        ? `<div class="empty-state">No events found.</div>`
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

  const labels = Object.keys(breakdown).map(k => k.charAt(0).toUpperCase() + k.slice(1));
  const values = Object.values(breakdown);

  _breakdownChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#ef4444', '#10b981', '#6384ff', '#f59e0b'],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter' }, padding: 12 } },
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
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

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
    if (btn) { btn.disabled = false; btn.textContent = type.toUpperCase(); }
    if (window.lucide) lucide.createIcons();
  }
}

// Export global namespace for app.js navigation
window.Reports = { load: initReports };
