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
      bindFileDropZone();
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
        await populateEventDropdown(); // refresh dropdown
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
        const formData = new FormData(form);
        await Api.transactions.create(formData);
        UI.toast('Transaction recorded successfully!', 'success');
        form.reset();
        setTodayDate();
        const preview = document.getElementById('file-preview');
        preview.classList.add('hidden');
        preview.textContent = '';
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
        // Insert directly via Supabase client — RLS will validate admin role
        const { error } = await window.supabaseClient
          .from('announcements')
          .insert({
            title: document.getElementById('announce-title').value,
            body:  document.getElementById('announce-body').value
          });

        if (error) throw new Error(error.message);
        UI.toast('Announcement posted!', 'success');
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

  // ---- File Drop Zone ----
  function bindFileDropZone() {
    const zone    = document.getElementById('receipt-drop-zone');
    const input   = document.getElementById('tx-receipt');
    const preview = document.getElementById('file-preview');

    if (!zone || !input) return;

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) {
        preview.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        preview.classList.remove('hidden');
      }
    });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        const dt = new DataTransfer();
        dt.items.add(e.dataTransfer.files[0]);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  return { init };
})();
