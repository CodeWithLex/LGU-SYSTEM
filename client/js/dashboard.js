// =============================================
// dashboard.js — Dashboard View Module
// =============================================

const Dashboard = (() => {

  let realtimeChannel = null;

  async function load() {
    await Promise.all([loadStats(), loadRecentTransactions(), loadAnnouncements()]);
    subscribeRealtime();
  }

  async function loadStats() {
    try {
      const summary = await Api.reports.summary();
      document.getElementById('stat-income').textContent    = UI.currency(summary.totalIncome);
      document.getElementById('stat-expense').textContent   = UI.currency(summary.totalExpense);
      document.getElementById('stat-balance').textContent   = UI.currency(summary.remainingBalance);
      document.getElementById('stat-donations').textContent = UI.currency(summary.breakdown.donation);
    } catch (err) {
      console.error('Stats load error:', err);
    }
  }

  async function loadRecentTransactions() {
    const container = document.getElementById('recent-tx-list');
    try {
      const txs = await Api.transactions.list({ limit: 8 });
      if (!txs.length) { UI.setEmpty('recent-tx-list', 'credit-card', 'No transactions yet.'); return; }

      container.innerHTML = txs.map(tx => `
        <div class="tx-item">
          <span class="tx-badge badge-${tx.type}">${UI.capitalize(tx.type)}</span>
          <span class="tx-desc" title="${tx.description}">${tx.description}</span>
          <div>
            <div class="tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}">
              ${tx.type === 'expense' ? '-' : '+'}${UI.currency(tx.amount)}
            </div>
            <div class="tx-meta">${UI.dateStr(tx.transaction_date)}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="loading-state"><i data-lucide="alert-triangle"></i> Failed to load transactions.</div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  async function loadAnnouncements() {
    const container = document.getElementById('announcement-list');
    try {
      const { data } = await window.supabaseClient
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!data?.length) { UI.setEmpty('announcement-list', 'megaphone', 'No announcements yet.'); return; }

      container.innerHTML = data.map(a => `
        <div class="announce-item">
          <h4>${a.title}</h4>
          <p>${a.body}</p>
          <div class="announce-date">${UI.dateStr(a.created_at)}</div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="loading-state"><i data-lucide="alert-triangle"></i> Failed to load announcements.</div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function subscribeRealtime() {
    if (realtimeChannel) window.supabaseClient.removeChannel(realtimeChannel);

    realtimeChannel = window.supabaseClient
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        loadStats();
        loadRecentTransactions();
        UI.toast('Dashboard updated with a new transaction.', 'info');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => {
        loadAnnouncements();
        UI.toast('New announcement posted!', 'info');
      })
      .subscribe();
  }

  function destroy() {
    if (realtimeChannel) window.supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  return { load, destroy };
})();
