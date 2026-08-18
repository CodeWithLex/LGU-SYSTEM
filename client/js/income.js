// =============================================
// income.js — General Income Tracker Module
// =============================================

const Income = (() => {

  async function load() {
    try {
      // Fetch transactions
      const txs = await Api.transactions.list({ limit: 1000 });
      // Filter out only incomes
      const incomes = txs.filter(t => ['donation', 'collection', 'allocation'].includes(t.type));
      renderTable(incomes);
    } catch (err) {
      document.getElementById('income-table-body').innerHTML = 
        `<tr><td colspan="5" class="loading-state">Failed to load income history.</td></tr>`;
    }
  }

  function renderTable(txs) {
    const tbody = document.getElementById('income-table-body');
    if (!txs.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon"><i data-lucide="piggy-bank"></i></span><p>No income recorded yet.</p></div></td></tr>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    tbody.innerHTML = txs.map(tx => `
      <tr>
        <td>${UI.dateStr(tx.transaction_date)}</td>
        <td>${UI.renderStatusBadge(tx.type)}</td>
        <td>${tx.description}</td>
        <td class="tx-amount ${tx.type}">+${UI.currency(tx.amount)}</td>
        <td style="color:var(--text-secondary);font-size:0.82rem">${tx.profiles?.full_name || 'System'}</td>
      </tr>
    `).join('');
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function bindForm() {
    const form = document.getElementById('add-income-form');
    const errEl = document.getElementById('inc-error');
    if (!form || form._bound) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const btn = document.getElementById('inc-submit');
      
      const type = document.getElementById('inc-type').value;
      const desc = document.getElementById('inc-desc').value;
      const amount = Number(document.getElementById('inc-amount').value);
      const date = document.getElementById('inc-date').value;
      const receiptUrl = document.getElementById('inc-receipt').value || null;

      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        await Api.transactions.create({
          event_id: null,
          use_allocation: false,
          type,
          description: desc,
          amount,
          transaction_date: date,
          receipt_url: receiptUrl
        });

        form.reset();
        document.getElementById('inc-date').value = new Date().toISOString().split('T')[0];
        
        await load(); // refresh table
        // Optional: Trigger dashboard refresh if required by other components
        document.dispatchEvent(new Event('transaction-updated'));
        
        // Use UI.js generic alert or something, or fallback to an alert
        alert('Income added to general fund successfully!');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Add to Total Income';
      }
    });

    form._bound = true;
    document.getElementById('inc-date').value = new Date().toISOString().split('T')[0];
  }

  return { load, bindForm };
})();
