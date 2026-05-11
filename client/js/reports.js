// =============================================
// reports.js — Monthly Reports View Module
// =============================================

const Reports = (() => {

  async function load() {
    const container = document.getElementById('reports-content');
    container.innerHTML = '<div class="loading-state">Generating report…</div>';

    try {
      const [summary, monthly] = await Promise.all([
        Api.reports.summary(),
        Api.reports.monthly()
      ]);

      container.innerHTML = `
        <div class="dashboard-card" style="margin-bottom:1.5rem">
          <h3>Overall Financial Summary</h3>
          <div class="monthly-report-grid" style="margin-top:1rem">
            <div class="stat-card stat-income" style="flex-direction:column;align-items:flex-start">
              <p class="stat-label">Total Income</p>
              <h3 class="stat-value">${UI.currency(summary.totalIncome)}</h3>
            </div>
            <div class="stat-card stat-expense" style="flex-direction:column;align-items:flex-start">
              <p class="stat-label">Total Expenses</p>
              <h3 class="stat-value">${UI.currency(summary.totalExpense)}</h3>
            </div>
            <div class="stat-card stat-balance" style="flex-direction:column;align-items:flex-start">
              <p class="stat-label">Net Balance</p>
              <h3 class="stat-value">${UI.currency(summary.remainingBalance)}</h3>
            </div>
            <div class="stat-card stat-donations" style="flex-direction:column;align-items:flex-start">
              <p class="stat-label">Donations</p>
              <h3 class="stat-value">${UI.currency(summary.breakdown.donation)}</h3>
            </div>
          </div>
        </div>

        <div class="dashboard-card">
          <h3>Monthly Breakdown</h3>
          <div class="monthly-report-grid">
            ${monthly.length
              ? monthly.map(m => {
                  const monthLabel = new Date(m.month + '-01').toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
                  const net = m.income - m.expense;
                  return `
                    <div class="month-card">
                      <h4>${monthLabel}</h4>
                      <div class="month-row">
                        <span>Income</span>
                        <span style="color:var(--col-success)">${UI.currency(m.income)}</span>
                      </div>
                      <div class="month-row">
                        <span>Expenses</span>
                        <span style="color:var(--col-danger)">${UI.currency(m.expense)}</span>
                      </div>
                      <div class="month-row">
                        <span>Remaining</span>
                        <span style="color:${net >= 0 ? 'var(--col-primary)' : 'var(--col-danger)'}">${UI.currency(net)}</span>
                      </div>
                    </div>`;
                }).join('')
              : '<div class="empty-state"><span class="empty-icon">📈</span><p>No monthly data yet.</p></div>'
            }
          </div>
        </div>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Failed to generate reports.</p></div>`;
    }
  }

  return { load };
})();
