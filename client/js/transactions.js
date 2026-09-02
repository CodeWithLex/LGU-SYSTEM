// =============================================
// transactions.js - Transactions View Module
// =============================================

const Transactions = (() => {

  let allTxs = [];
  let _isAdmin = false;

  async function load() {
    // Check admin status from the sidebar role label
    _isAdmin = document.getElementById('user-role')?.textContent?.includes('Admin');
    try {
      allTxs = await Api.transactions.list({ limit: 200 });
      renderTable(allTxs);
      bindFilter();
    } catch (err) {
      document.getElementById('tx-table-body').innerHTML =
        `<tr><td colspan="8" class="loading-state">Failed to load transactions.</td></tr>`;
    }
  }

  function renderTable(txs) {
    const tbody = document.getElementById('tx-table-body');

    if (!txs.length) {
      const colSpan = _isAdmin ? 8 : 7;
      tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state"><span class="empty-icon"><iconify-icon icon="solar:card-transfer-linear"></iconify-icon></span><p>No transactions found.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = txs.map(tx => `
      <tr>
        <td>${UI.dateStr(tx.transaction_date)}</td>
        <td style="color:var(--text-secondary);font-size:0.82rem">${tx.events?.event_name || '-'}</td>
        <td>${UI.renderStatusBadge(tx.type)}</td>
        <td>${tx.description}</td>
        <td class="tx-amount ${tx.type}">
          ${tx.type === 'expense' ? '-' : (tx.type === 'transfer' ? '' : '+')}${UI.currency(tx.amount)}
        </td>
        <td>${tx.receipt_url
          ? `<button type="button" class="receipt-link" data-receipt-url="${tx.receipt_url}" data-desc="${(tx.description || '').replace(/"/g, '&quot;')}" data-amount="${tx.amount}" data-date="${tx.transaction_date}" data-type="${tx.type}" data-event="${(tx.events?.event_name || '').replace(/"/g, '&quot;')}" style="display:flex;align-items:center;gap:0.3rem;"><iconify-icon icon="solar:paperclip-linear" style="font-size:15px"></iconify-icon> View</button>`
          : '<span style="color:var(--text-tertiary)">-</span>'}</td>
        <td style="color:var(--text-secondary);font-size:0.82rem">${tx.profiles?.full_name || '-'}</td>
        ${_isAdmin ? `
        <td style="text-align:center;">
          <div style="display:inline-flex;gap:.4rem;">
            <button class="tx-action-btn tx-edit-btn"
              data-txid="${tx.id}"
              data-desc="${(tx.description || '').replace(/"/g, '&quot;')}"
              data-amount="${tx.amount}"
              data-date="${tx.transaction_date}"
              data-receipt="${tx.receipt_url || ''}"><iconify-icon icon="solar:pen-linear" style="font-size:15px"></iconify-icon></button>
            <button class="tx-action-btn tx-del-btn"
              data-txid="${tx.id}"
              data-desc="${(tx.description || '').replace(/"/g, '&quot;')}"><iconify-icon icon="solar:trash-bin-trash-linear" style="font-size:15px"></iconify-icon></button>
          </div>
        </td>` : ''}
      </tr>
    `).join('');

    // ---- Mobile Cards ----
    const cardContainer = document.getElementById('tx-mobile-cards');
    if (cardContainer) {
      cardContainer.innerHTML = txs.map(tx => `
        <div class="data-card">
          <div class="data-card-header">
            ${UI.renderStatusBadge(tx.type)}
            <span style="font-size:0.75rem;color:var(--text-secondary);">${UI.dateStr(tx.transaction_date)}</span>
          </div>
          <div class="data-card-body">
            <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.15rem;">${tx.description}</div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.5rem;">
               <span class="tx-amount ${tx.type}" style="font-size:1.2rem;font-weight:800;">
                ${tx.type === 'expense' ? '-' : '+'}${UI.currency(tx.amount)}
              </span>
              ${tx.receipt_url ? `<button type="button" class="receipt-link" data-receipt-url="${tx.receipt_url}" data-desc="${(tx.description || '').replace(/"/g, '&quot;')}" data-amount="${tx.amount}" data-date="${tx.transaction_date}" data-type="${tx.type}" data-event="${(tx.events?.event_name || '').replace(/"/g, '&quot;')}" style="font-size:0.8rem;"><iconify-icon icon="solar:paperclip-linear" style="font-size:15px"></iconify-icon> Receipt</button>` : ''}
            </div>
            <div style="font-size:0.72rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.3rem;">
              <iconify-icon icon="solar:user-linear" style="font-size:12px"></iconify-icon> ${tx.profiles?.full_name || 'System'}
            </div>
          </div>
          ${_isAdmin ? `
          <div class="data-card-actions" style="margin-top:0.75rem;padding-top:0.5rem;">
            <button class="tx-action-btn tx-edit-btn" style="padding:0.4rem 0.8rem;"
              data-txid="${tx.id}"
              data-desc="${(tx.description || '').replace(/"/g, '&quot;')}"
              data-amount="${tx.amount}"
              data-date="${tx.transaction_date}"
              data-receipt="${tx.receipt_url || ''}"><iconify-icon icon="solar:pen-linear"></iconify-icon></button>
            <button class="tx-action-btn tx-del-btn" style="padding:0.4rem 0.8rem;"
              data-txid="${tx.id}"
              data-desc="${(tx.description || '').replace(/"/g, '&quot;')}"><iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon></button>
          </div>` : ''}
        </div>
      `).join('');
    }
  }

  function bindTableEvents() {
    const tbody = document.getElementById('tx-table-body');
    const mobContainer = document.getElementById('tx-mobile-cards');
    if (!tbody || tbody._bound) return;

    const handleClick = e => {
      const editBtn = e.target.closest('.tx-edit-btn');
      const delBtn  = e.target.closest('.tx-del-btn');
      if (editBtn) {
        editModal(editBtn.dataset.txid, editBtn.dataset.desc, editBtn.dataset.amount, editBtn.dataset.date, editBtn.dataset.receipt);
      } else if (delBtn) {
        deleteModal(delBtn.dataset.txid, delBtn.dataset.desc);
      }
    };

    tbody.addEventListener('click', handleClick);
    if (mobContainer) mobContainer.addEventListener('click', handleClick);
    tbody._bound = true;
  }

  function bindFilter() {
    const typeEl   = document.getElementById('filter-type');
    const eventEl  = document.getElementById('filter-event');
    const searchEl = document.getElementById('tx-search');
    
    // Initial population of event filter
    populateEventFilter();
    bindTableEvents();

    function applyFilters() {
      const type    = typeEl ? typeEl.value : 'all';
      const eventId = eventEl ? eventEl.value : 'all';
      const text    = searchEl ? searchEl.value.toLowerCase().trim() : '';

      const filtered = allTxs.filter(t => {
        const matchesType  = (type === 'all') || (t.type === type);
        const matchesEvent = (eventId === 'all') || (String(t.event_id) === eventId);
        const matchesText  = !text || 
          (t.description || '').toLowerCase().includes(text) || 
          (t.profiles?.full_name || '').toLowerCase().includes(text) ||
          (t.events?.event_name || '').toLowerCase().includes(text);
        
        return matchesType && matchesEvent && matchesText;
      });
      renderTable(filtered);
    }

    if (typeEl && !typeEl._bound) {
      typeEl.addEventListener('change', applyFilters);
      typeEl._bound = true;
    }
    if (eventEl && !eventEl._bound) {
      eventEl.addEventListener('change', applyFilters);
      eventEl._bound = true;
    }
    if (searchEl && !searchEl._bound) {
      searchEl.addEventListener('input', applyFilters);
      searchEl._bound = true;
    }
  }

  function populateEventFilter() {
    const eventEl = document.getElementById('filter-event');
    if (!eventEl) return;

    // Get unique events from the current transaction set
    const uniqueEvents = [];
    const seen = new Set();

    allTxs.forEach(tx => {
      if (tx.event_id && tx.events && !seen.has(tx.event_id)) {
        uniqueEvents.push({ id: tx.event_id, name: tx.events.event_name });
        seen.add(tx.event_id);
      }
    });

    // Add "Unassociated / General" if any tx has no event_id
    if (allTxs.some(tx => !tx.event_id)) {
      uniqueEvents.push({ id: 'null', name: 'General Fund (No Event)' });
    }

    eventEl.innerHTML = '<option value="all">All Events</option>' + 
      uniqueEvents.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  }

  // ── Edit Modal ──────────────────────────────────────────────────────────
  function editModal(id, desc, amount, date, receipt) {
    const existing = document.getElementById('tx-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'tx-edit-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <h3 style="margin:0 0 1rem;font-size:1.1rem;">Edit Transaction</h3>
        <div class="form-group">
          <label>Description</label>
          <input id="edit-desc" type="text" value="${desc}" maxlength="500" />
        </div>
        <div class="form-group">
          <label>Amount (₱)</label>
          <input id="edit-amount" type="number" step="0.01" min="0" value="${amount}" />
        </div>
        <div class="form-group">
          <label>Date</label>
          <input id="edit-date" type="date" value="${date}" />
        </div>
        <div class="form-group">
          <label>Receipt URL (G-Drive Link)</label>
          <input id="edit-receipt" type="url" value="${receipt || ''}" placeholder="Paste Google Drive/Receipt link here" />
        </div>
        <div class="form-group">
          <label>Reason for Edit <span style="color:#ef4444">*</span></label>
          <input id="edit-reason" type="text" placeholder="Required - why are you editing this?" />
        </div>
        <div class="auth-error hidden" id="edit-error"></div>
        <div style="display:flex;gap:.75rem;margin-top:1rem;">
          <button class="btn btn-primary" style="flex:1;" id="edit-submit-btn">Save Changes</button>
          <button class="btn btn-ghost" style="flex:1;" onclick="document.getElementById('tx-edit-modal').remove()">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('edit-submit-btn').addEventListener('click', async () => {
      const btn    = document.getElementById('edit-submit-btn');
      const errEl  = document.getElementById('edit-error');
      const reason = document.getElementById('edit-reason').value.trim();
      errEl.classList.add('hidden');

      if (!reason || reason.length < 5) {
        errEl.textContent = 'Please provide a reason (min 5 characters).';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await Api.transactions.update(id, {
          description:      document.getElementById('edit-desc').value,
          amount:           document.getElementById('edit-amount').value,
          transaction_date: document.getElementById('edit-date').value,
          receipt_url:      document.getElementById('edit-receipt').value,
          reason,
        });
        modal.remove();
        UI.toast('Transaction updated successfully.', 'success');
        document.dispatchEvent(new CustomEvent('transaction-updated'));
        load();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    });
  }

  // ── Delete Modal ────────────────────────────────────────────────────────
  function deleteModal(id, desc) {
    const existing = document.getElementById('tx-delete-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'tx-delete-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <h3 style="margin:0 0 .5rem;font-size:1.1rem;color:#ef4444;">Delete Transaction</h3>
        <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:.9rem;">
          You are about to delete: <strong>${desc}</strong>.<br>This action is permanent and recorded.
        </p>
        <div class="form-group">
          <label>Reason for Deletion <span style="color:#ef4444">*</span></label>
          <input id="delete-reason" type="text" placeholder="Required - why are you deleting this?" />
        </div>
        <div class="auth-error hidden" id="delete-error"></div>
        <div style="display:flex;gap:.75rem;margin-top:1rem;">
          <button class="btn btn-primary" style="flex:1;background:#ef4444;" id="delete-submit-btn">Confirm Delete</button>
          <button class="btn btn-ghost" style="flex:1;" onclick="document.getElementById('tx-delete-modal').remove()">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('delete-submit-btn').addEventListener('click', async () => {
      const btn    = document.getElementById('delete-submit-btn');
      const errEl  = document.getElementById('delete-error');
      const reason = document.getElementById('delete-reason').value.trim();
      errEl.classList.add('hidden');

      if (!reason || reason.length < 5) {
        errEl.textContent = 'Please provide a reason (min 5 characters).';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Deleting…';
      try {
        await Api.transactions.remove(id, { reason });
        modal.remove();
        UI.toast('Transaction deleted.', 'success');
        document.dispatchEvent(new CustomEvent('transaction-updated'));
        load();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Confirm Delete';
      }
    });
  }

  return { load, editModal, deleteModal };
})();
