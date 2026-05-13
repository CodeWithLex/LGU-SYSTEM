// =============================================
// dashboard.js — Dashboard View Module
// =============================================

const Dashboard = (() => {

  let realtimeChannel = null;

  async function load() {
    await Promise.all([loadStats(), loadRecentTransactions(), loadAnnouncements()]);
    subscribeRealtime();
    bindPopovers();
  }

  function bindPopovers() {
    const backdrop = document.getElementById('stat-backdrop');
    if (!backdrop) return;
    
    document.querySelectorAll('.stat-card').forEach(card => {
      const showHover = () => {
        card.classList.add('hover-active');
        backdrop.classList.add('active');
      };
      const hideHover = () => {
        card.classList.remove('hover-active');
      };
      
      card.addEventListener('mouseenter', showHover);
      card.addEventListener('mouseleave', (e) => {
         hideHover();
         backdrop.classList.remove('active');
      });
      // Tap toggle for mobile
      card.addEventListener('click', (e) => {
        // Prevent bubbling to backdrop immediately
        e.stopPropagation();
        if (card.classList.contains('hover-active')) {
             hideHover();
             backdrop.classList.remove('active');
        } else {
             document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('hover-active'));
             showHover();
        }
      });
    });

    backdrop.addEventListener('click', () => {
      document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('hover-active'));
      backdrop.classList.remove('active');
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

      document.getElementById('pop-expense').innerHTML = `
        <div class="stat-pop-row" style="color:var(--col-text);line-height:1.4;">General Expenses (excludes funds used from Event Allocations)</div>
        <div class="stat-pop-row total"><span>Total Deductions</span> <span>${UI.currency(summary.totalExpense)}</span></div>
      `;

      document.getElementById('pop-balance').innerHTML = `
        <div class="stat-pop-row"><span>Total Income</span> <span>${UI.currency(summary.totalIncome)}</span></div>
        <div class="stat-pop-row"><span>General Expenses</span> <span>-${UI.currency(summary.totalExpense)}</span></div>
        <div class="stat-pop-row total"><span>Net Valid Balance</span> <span>${UI.currency(summary.remainingBalance)}</span></div>
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
