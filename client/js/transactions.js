// =============================================
// transactions.js — Transactions View Module
// =============================================

const Transactions = (() => {

  let allTxs = [];

  async function load() {
    try {
      allTxs = await Api.transactions.list({ limit: 200 });
      renderTable(allTxs);
      bindFilter();
    } catch (err) {
      document.getElementById('tx-table-body').innerHTML =
        `<tr><td colspan="7" class="loading-state">Failed to load transactions.</td></tr>`;
    }
  }

  function renderTable(txs) {
    const tbody = document.getElementById('tx-table-body');
    if (!txs.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">💳</span><p>No transactions found.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = txs.map(tx => `
      <tr>
        <td>${UI.dateStr(tx.transaction_date)}</td>
        <td style="color:var(--col-text-muted);font-size:0.82rem">${tx.event_id ? '—' : '—'}</td>
        <td><span class="tx-badge badge-${tx.type}">${UI.capitalize(tx.type)}</span></td>
        <td>${tx.description}</td>
        <td class="tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}">
          ${tx.type === 'expense' ? '-' : '+'}${UI.currency(tx.amount)}
        </td>
        <td>${tx.receipt_url
            ? `<a class="receipt-link" href="${tx.receipt_url}" target="_blank">📎 View</a>`
            : '<span style="color:var(--col-text-dim)">—</span>'}</td>
        <td style="color:var(--col-text-muted);font-size:0.82rem">${tx.profiles?.full_name || '—'}</td>
      </tr>
    `).join('');
  }

  function bindFilter() {
    document.getElementById('tx-type-filter').addEventListener('change', e => {
      const type = e.target.value;
      const filtered = type ? allTxs.filter(t => t.type === type) : allTxs;
      renderTable(filtered);
    });
  }

  return { load };
})();
