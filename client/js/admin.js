// =============================================
// admin.js — Admin View Module
// =============================================

const Admin = (() => {

  // Guard so form listeners only bind once
  let _initialized = false;

  async function init() {
    await populateEventDropdown();
    if (!_initialized) {
      bindEventForm();
      bindTransactionForm();
      bindAnnouncementForm();
      _initialized = true;
    }
    setTodayDate();
  }

  // ---- Event Dropdown ----
  async function populateEventDropdown() {
    const select = document.getElementById('tx-event-id');
    try {
      const events = await Api.events.list();
      select.innerHTML = '<option value="">Select Event</option>' +
        events.map(ev => `<option value="${ev.id}">${ev.event_name}</option>`).join('');
    } catch { /* non-fatal */ }
  }

  function setTodayDate() {
    const d = document.getElementById('tx-date');
    if (d) d.value = new Date().toISOString().split('T')[0];
  }

  // ---- Create Event Form ----
  function bindEventForm() {
    const form  = document.getElementById('add-event-form');
    const errEl = document.getElementById('ev-error');
    const btn   = document.getElementById('submit-ev-btn');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Creating…';

      try {
        await Api.events.create({
          event_name:       document.getElementById('ev-name').value,
          description:      document.getElementById('ev-description').value,
          allocated_budget: document.getElementById('ev-budget').value,
          event_date:       document.getElementById('ev-date').value || null,
          status:           document.getElementById('ev-status').value
        });

        UI.toast('Event created successfully!', 'success');
        form.reset();
        await populateEventDropdown();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Event';
      }
    });
  }

  // ---- Transaction Form ----
  function bindTransactionForm() {
    const form  = document.getElementById('add-tx-form');
    const errEl = document.getElementById('tx-error');
    const btn   = document.getElementById('submit-tx-btn');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        // Validate Google Drive link if provided
        const receiptUrl = document.getElementById('tx-receipt-url').value.trim();
        if (receiptUrl && !receiptUrl.includes('drive.google.com') && !receiptUrl.startsWith('http')) {
          throw new Error('Please enter a valid Google Drive link or leave it blank.');
        }

        await Api.transactions.create({
          event_id:         document.getElementById('tx-event-id').value,
          type:             document.getElementById('tx-type').value,
          amount:           document.getElementById('tx-amount').value,
          description:      document.getElementById('tx-desc').value,
          donor_name:       document.getElementById('tx-donor').value,
          transaction_date: document.getElementById('tx-date').value,
          receipt_url:      receiptUrl || null
        });

        UI.toast('Transaction recorded successfully!', 'success');
        form.reset();
        setTodayDate();
        await populateEventDropdown();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Transaction';
      }
    });
  }

  // ---- Announcement Form ----
  function bindAnnouncementForm() {
    const form  = document.getElementById('add-announce-form');
    const errEl = document.getElementById('announce-error');
    const btn   = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Posting…';

      try {
        // Post via backend so email notifications are triggered
        await Api.request('POST', '/announcements', {
          title: document.getElementById('announce-title').value,
          body:  document.getElementById('announce-body').value
        });

        UI.toast('Announcement posted! Students will be notified by email. 📧', 'success');
        form.reset();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Post Announcement';
      }
    });
  }

  return { init };
})();
