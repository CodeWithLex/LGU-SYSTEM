// =============================================
// events.js — Events View Module
// =============================================

const Events = (() => {

  let allEvents = [];
  let _isInitialized = false;

  function init() {
    if (_isInitialized) return;
    const searchInput = document.getElementById('events-search');
    const sortSelect  = document.getElementById('events-sort');

    if (searchInput) {
      searchInput.addEventListener('input', () => applyFilters());
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', () => applyFilters());
    }
    _isInitialized = true;
  }

  async function load() {
    init(); // Ensure listeners are bound
    const hasCached = Api.hasCache('/events');
    const grid = document.getElementById('events-grid');
    if (!hasCached && (!allEvents.length || !grid?.children?.length)) {
      UI.setLoading('events-grid', 'Loading events…');
    }
    try {
      allEvents = await Api.events.list();
      applyFilters(); // Apply current search/sort to newly loaded data
    } catch (err) {
      if (!allEvents.length) {
        UI.setEmpty('events-grid', 'caution', 'Failed to load events.');
      }
    }
  }

  function applyFilters() {
    const searchVal = document.getElementById('events-search')?.value.toLowerCase() || '';
    const sortVal   = document.getElementById('events-sort')?.value || 'newest';

    // 1. Filter
    let filtered = allEvents.filter(ev => 
      ev.event_name.toLowerCase().includes(searchVal) ||
      (ev.description || '').toLowerCase().includes(searchVal)
    );

    // 2. Sort
    filtered.sort((a, b) => {
      if (sortVal === 'name-asc') {
        return a.event_name.localeCompare(b.event_name);
      } else if (sortVal === 'budget-desc') {
        return b.allocated_budget - a.allocated_budget;
      } else if (sortVal === 'budget-asc') {
        return a.allocated_budget - b.allocated_budget;
      } else {
        // newest (created_at desc)
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });

    renderEventCards(filtered, searchVal.length > 0);
  }

  function renderEventCards(events, isSearching = false) {
    const grid = document.getElementById('events-grid');
    if (!events.length) {
      if (isSearching) {
        UI.setEmpty('events-grid', 'search', 'No events match your search.');
      } else {
        UI.setEmpty('events-grid', 'target', 'No events posted yet.');
      }
      return;
    }

    grid.innerHTML = events.map(ev => {
      const spent   = ev.computed_expenses || 0;
      const pct     = ev.allocated_budget > 0 ? Math.min((spent / ev.allocated_budget) * 100, 100) : 0;
      return `
        <div class="event-card" data-id="${ev.id}">
          ${UI.renderStatusBadge(ev.status)}
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
      const spent = ev.computed_expenses || 0;
      const pct   = ev.allocated_budget > 0 ? Math.min((spent / ev.allocated_budget) * 100, 100) : 0;

      container.innerHTML = `
        <div style="margin-bottom:1.5rem">
          ${UI.renderStatusBadge(ev.status)}
          <h2 style="font-size:1.75rem;margin:0.5rem 0">${ev.event_name}</h2>
          <p style="color:var(--text-secondary)">${ev.description || ''}</p>
          ${ev.event_date ? `<p style="font-size:0.85rem;margin-top:0.4rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.3rem;"><iconify-icon icon="icon-park-outline:calendar" style="font-size:14px" ></iconify-icon> ${UI.dateStr(ev.event_date)}</p>` : ''}
        </div>

        <div class="stats-grid" style="margin-bottom:1.5rem">
          <div class="stat-card stat-balance">
            <div class="stat-icon"><iconify-icon icon="icon-park-outline:wallet-one"></iconify-icon></div>
            <div class="stat-body">
              <p class="stat-label">Allocated</p>
              <h3 class="stat-value">${UI.currency(ev.allocated_budget)}</h3>
            </div>
          </div>
          <div class="stat-card stat-expense">
            <div class="stat-icon"><iconify-icon icon="icon-park-outline:trending-down"></iconify-icon></div>
            <div class="stat-body">
              <p class="stat-label">Expenses</p>
              <h3 class="stat-value">${UI.currency(spent)}</h3>
            </div>
          </div>
          <div class="stat-card stat-income">
            <div class="stat-icon"><iconify-icon icon="icon-park-outline:building-one"></iconify-icon></div>
            <div class="stat-body">
              <p class="stat-label">Remaining</p>
              <h3 class="stat-value">${UI.currency(ev.computed_remaining)}</h3>
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
                  ${UI.renderStatusBadge(tx.type)}
                  <span class="tx-desc">${tx.description}</span>
                  <div>
                    <div class="tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}">
                      ${tx.type === 'expense' ? '-' : '+'}${UI.currency(tx.amount)}
                    </div>
                    <div class="tx-meta">${UI.dateStr(tx.transaction_date)}</div>
                  </div>
                  ${tx.receipt_url ? `<a class="receipt-link" href="${tx.receipt_url}" target="_blank" style="display:flex;align-items:center;gap:0.3rem;"><iconify-icon icon="icon-park-outline:paperclip" style="font-size:14px" ></iconify-icon> Receipt</a>` : ''}
                </div>`).join('')
              : '<div class="empty-state"><span class="empty-icon"><iconify-icon icon="icon-park-outline:bank-card"></iconify-icon></span><p>No transactions recorded yet.</p></div>'
            }
          </div>
        </div>`;
} catch (err) {
      container.innerHTML = `<div class="loading-state">Failed to load event details.</div>`;
    }
  }

  function bindBackButton() {
    const btn = document.getElementById('back-to-events');
    if (btn) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        UI.showView('events');
      });
    }
  }

  return { load, bindBackButton };
})();
