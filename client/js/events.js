// =============================================
// events.js — Events View Module
// =============================================

const Events = (() => {

  let allEvents = [];

  async function load() {
    UI.setLoading('events-grid', 'Loading events…');
    try {
      allEvents = await Api.events.list();
      renderEventCards(allEvents);
    } catch (err) {
      UI.setEmpty('events-grid', 'alert-triangle', 'Failed to load events.');
    }
  }

  function renderEventCards(events) {
    const grid = document.getElementById('events-grid');
    if (!events.length) { UI.setEmpty('events-grid', 'target', 'No events posted yet.'); return; }

    grid.innerHTML = events.map(ev => {
      const spent   = ev.allocated_budget - ev.remaining_budget;
      const pct     = ev.allocated_budget > 0 ? Math.min((spent / ev.allocated_budget) * 100, 100) : 0;
      return `
        <div class="event-card" data-id="${ev.id}">
          <span class="event-status-badge status-${ev.status}">${UI.capitalize(ev.status)}</span>
          <h3>${ev.event_name}</h3>
          <p>${ev.description || 'No description provided.'}</p>
          <div class="event-budget-bar">
            <div class="event-budget-fill" style="width:${pct}%"></div>
          </div>
          <div class="event-budget-labels">
            <span>Spent: <strong>${UI.currency(spent)}</strong></span>
            <span>Budget: <strong>${UI.currency(ev.allocated_budget)}</strong></span>
          </div>
        </div>`;
    }).join('');

    // Attach click handlers for event detail
    grid.querySelectorAll('.event-card').forEach(card => {
      card.addEventListener('click', () => loadEventDetail(card.dataset.id));
    });
  }

  async function loadEventDetail(id) {
    UI.showView('event-detail');
    const container = document.getElementById('event-detail-content');
    container.innerHTML = '<div class="loading-state">Loading event details…</div>';

    try {
      const ev = await Api.events.get(id);
      const spent = ev.allocated_budget - ev.remaining_budget;
      const pct   = ev.allocated_budget > 0 ? Math.min((spent / ev.allocated_budget) * 100, 100) : 0;

      container.innerHTML = `
        <div style="margin-bottom:1.5rem">
          <span class="event-status-badge status-${ev.status}">${UI.capitalize(ev.status)}</span>
          <h2 style="font-size:1.75rem;margin:0.5rem 0">${ev.event_name}</h2>
          <p style="color:var(--col-text-muted)">${ev.description || ''}</p>
          ${ev.event_date ? `<p style="font-size:0.85rem;margin-top:0.4rem;color:var(--col-text-muted);display:flex;align-items:center;gap:0.3rem;"><i data-lucide="calendar" style="width:14px;"></i> ${UI.dateStr(ev.event_date)}</p>` : ''}
        </div>

        <div class="stats-grid" style="margin-bottom:1.5rem">
          <div class="stat-card stat-balance">
            <div class="stat-icon"><i data-lucide="wallet"></i></div>
            <div class="stat-body">
              <p class="stat-label">Allocated</p>
              <h3 class="stat-value">${UI.currency(ev.allocated_budget)}</h3>
            </div>
          </div>
          <div class="stat-card stat-expense">
            <div class="stat-icon"><i data-lucide="trending-down"></i></div>
            <div class="stat-body">
              <p class="stat-label">Expenses</p>
              <h3 class="stat-value">${UI.currency(spent)}</h3>
            </div>
          </div>
          <div class="stat-card stat-income">
            <div class="stat-icon"><i data-lucide="building"></i></div>
            <div class="stat-body">
              <p class="stat-label">Remaining</p>
              <h3 class="stat-value">${UI.currency(ev.remaining_budget)}</h3>
            </div>
          </div>
        </div>

        <div class="event-budget-bar" style="margin-bottom:1.5rem;height:8px">
          <div class="event-budget-fill" style="width:${pct}%"></div>
        </div>

        <div class="dashboard-card">
          <h3>Transaction History</h3>
          <div class="tx-list">
            ${ev.transactions && ev.transactions.length
              ? ev.transactions.map(tx => `
                <div class="tx-item">
                  <span class="tx-badge badge-${tx.type}">${UI.capitalize(tx.type)}</span>
                  <span class="tx-desc">${tx.description}</span>
                  <div>
                    <div class="tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}">
                      ${tx.type === 'expense' ? '-' : '+'}${UI.currency(tx.amount)}
                    </div>
                    <div class="tx-meta">${UI.dateStr(tx.transaction_date)}</div>
                  </div>
                  ${tx.receipt_url ? `<a class="receipt-link" href="${tx.receipt_url}" target="_blank" style="display:flex;align-items:center;gap:0.3rem;"><i data-lucide="paperclip" style="width:14px;"></i> Receipt</a>` : ''}
                </div>`).join('')
              : '<div class="empty-state"><span class="empty-icon"><i data-lucide="credit-card"></i></span><p>No transactions recorded yet.</p></div>'
            }
          </div>
        </div>`;
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="loading-state">Failed to load event details.</div>`;
    }
  }

  function bindBackButton() {
    document.getElementById('back-to-events').addEventListener('click', e => {
      e.preventDefault();
      UI.showView('events');
    });
  }

  return { load, bindBackButton };
})();
