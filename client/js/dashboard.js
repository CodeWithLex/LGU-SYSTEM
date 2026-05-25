// =============================================
// dashboard.js — Dashboard View Module
// =============================================

const Dashboard = (() => {

  let realtimeChannel = null;

  async function load() {
    await Promise.all([loadStats(), loadRecentTransactions(), loadAnnouncements()]);
    subscribeRealtime();
    bindPopovers();

    // Listen for local updates (e.g. from Income tab)
    document.addEventListener('transaction-updated', () => {
      loadStats();
      loadRecentTransactions();
    });
  }

  function bindPopovers() {
    document.querySelectorAll('.stat-card').forEach(card => {
      const showHover = () => card.classList.add('hover-active');
      const hideHover = () => card.classList.remove('hover-active');
      
      card.addEventListener('mouseenter', showHover);
      card.addEventListener('mouseleave', hideHover);

      // Tap toggle for mobile
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (card.classList.contains('hover-active')) {
             hideHover();
        } else {
             document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('hover-active'));
             showHover();
        }
      });
    });

    // Close any open popovers when clicking elsewhere
    document.addEventListener('click', () => {
      document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('hover-active'));
    });
  }

  async function loadStats() {
    try {
      const summary = await Api.reports.summary();
      document.getElementById('stat-income').textContent    = UI.currency(summary.totalIncome);
      document.getElementById('stat-expense').textContent   = UI.currency(summary.totalExpense);
      document.getElementById('stat-balance').textContent   = UI.currency(summary.remainingBalance);
      document.getElementById('stat-donations').textContent = UI.currency(summary.breakdown.donation);

      // Populate popover breakdowns
      document.getElementById('pop-income').innerHTML = `
        <div class="stat-pop-row"><span>Donations</span> <span>${UI.currency(summary.breakdown.donation)}</span></div>
        <div class="stat-pop-row"><span>Collections</span> <span>${UI.currency(summary.breakdown.collection)}</span></div>
        <div class="stat-pop-row"><span>Allocations In</span> <span>${UI.currency(summary.breakdown.allocation)}</span></div>
        <div class="stat-pop-row total"><span>Total Income</span> <span>${UI.currency(summary.totalIncome)}</span></div>
      `;

      const eventExpense = summary.totalExpense - summary.generalExpense;
      document.getElementById('pop-expense').innerHTML = `
        <div class="stat-pop-row"><span>General/Misc</span> <span>${UI.currency(summary.generalExpense)}</span></div>
        <div class="stat-pop-row"><span>Event Spending</span> <span>${UI.currency(eventExpense)}</span></div>
        <div class="stat-pop-row total"><span>Total Spent</span> <span>${UI.currency(summary.totalExpense)}</span></div>
      `;

      document.getElementById('pop-balance').innerHTML = `
        <div class="stat-pop-row income"><span>Total Income</span> <span>${UI.currency(summary.totalIncome)}</span></div>
        <div class="stat-pop-row expense"><span>Misc Expenses</span> <span>-${UI.currency(summary.generalExpense)}</span></div>
        <div class="stat-pop-row" style="color:var(--col-warning)"><span>Reserved (Events)</span> <span>-${UI.currency(summary.breakdown.reserved_envelopes)}</span></div>
        <div class="stat-pop-row total"><span>Available Fund</span> <span>${UI.currency(summary.remainingBalance)}</span></div>
        <p style="font-size:0.65rem;color:var(--col-text-dim);margin-top:0.4rem;line-height:1.2;">Unreserved cash available for new allocations or general operations.</p>
      `;

      document.getElementById('pop-donations').innerHTML = `
        <div class="stat-pop-row" style="color:var(--col-text);line-height:1.4;">Total value of sponsorships and community contributions.</div>
      `;
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
            <div class="tx-amount ${tx.type}">
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
