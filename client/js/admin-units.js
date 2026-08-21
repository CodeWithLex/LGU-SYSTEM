// =============================================
// admin-units.js — Admin Academic Management
// (Academics tab: student records override +
// curriculum manager). Lazy-loaded when the
// academics tab first activates.
// =============================================

const AdminUnits = (() => {

  let _loaded        = false;
  let _student       = null;   // selected student profile
  let _records       = [];     // their enrollment records
  let _subjects      = [];     // curriculum subjects for their program (student-facing set)
  let _requirements  = [];
  let _currProgram   = 'BSCoE';
  let _currSubjects  = [];

  const VALID_PROGRAMS = ['BSCoE', 'BSCE', 'BSECE'];
  const PROGRAM_NAMES = {
    BSCoE: 'Computer Engineering',
    BSCE:  'Civil Engineering',
    BSECE: 'Electronics Engineering',
  };
  const STATUS_LABELS = {
    enrolled:   'Enrolled',
    passed:     'Passed',
    failed:     'Failed',
    dropped:    'Dropped',
    incomplete: 'Incomplete',
  };
  const SEM_SHORT = { 1: '1st Sem', 2: '2nd Sem', 3: 'Summer' };

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function programOf(profile) {
    return VALID_PROGRAMS.find(
      p => p.toUpperCase() === String(profile?.course || '').trim().toUpperCase()
    ) || null;
  }

  function currentSchoolYear() {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  function currentSemester() {
    const m = new Date().getMonth() + 1;
    return m >= 6 && m <= 10 ? 1 : 2;
  }

  // Modal show/hide with the shared close animation (same behavior as
  // units.js — kept local so the modules stay independent).
  function openModalOverlay(id) {
    const el = document.getElementById(id);
    el.classList.remove('modal-closing');
    el.classList.remove('hidden');
  }

  function closeModalOverlay(id) {
    const el = document.getElementById(id);
    if (el.classList.contains('hidden') || el.classList.contains('modal-closing')) return;
    el.classList.add('modal-closing');
    el.addEventListener('animationend', function done(e) {
      if (e.target !== el) return;
      el.removeEventListener('animationend', done);
      if (!el.classList.contains('modal-closing')) return;
      el.classList.remove('modal-closing');
      el.classList.add('hidden');
    });
  }

  // ---- Load ----
  function load() {
    if (!_loaded) {
      bindSearch();
      bindWorkspace();
      bindRecordModal();
      bindSubjectModal();
      bindCurriculum();
      _loaded = true;
    }
    loadCurriculum();
  }

  // ---- Student search ----
  let _searchTimer = null;

  function bindSearch() {
    document.getElementById('au-search').addEventListener('input', e => {
      clearTimeout(_searchTimer);
      const q = e.target.value.trim();
      const box = document.getElementById('au-results');
      if (q.length < 2) { box.innerHTML = ''; return; }
      _searchTimer = setTimeout(() => searchStudents(q), 300);
    });
  }

  async function searchStudents(q) {
    const box = document.getElementById('au-results');
    box.innerHTML = '<div class="loading-state">Searching…</div>';
    try {
      const list = await Api.admin.studentsSearch(q);
      renderResults(list || []);
    } catch (err) {
      box.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="icon-park-outline:caution" class="empty-icon"></iconify-icon>
          <p>${esc(err.message)}</p>
        </div>`;
    }
  }

  function renderResults(list) {
    const box = document.getElementById('au-results');
    if (!list.length) {
      box.innerHTML = '<div class="empty-state">No students matched.</div>';
      return;
    }
    box.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Course</th><th>Year</th><th></th></tr></thead>
          <tbody>
            ${list.map(u => `
              <tr>
                <td><strong>${esc(u.full_name || '—')}</strong></td>
                <td style="font-size:.8rem;color:var(--text-secondary)">${esc(u.email || '—')}</td>
                <td style="font-size:.8rem">${esc(u.course || '—')}</td>
                <td style="font-size:.8rem">${esc(String(u.year_level ?? '—'))}</td>
                <td style="text-align:center;"><button class="tx-action-btn" data-au="pick" data-id="${u.id}">Open</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ---- Student workspace ----
  function bindWorkspace() {
    document.getElementById('au-results').addEventListener('click', e => {
      const btn = e.target.closest('[data-au="pick"]');
      if (btn) pickStudent(btn.dataset.id);
    });

    document.getElementById('au-workspace').addEventListener('click', e => {
      const btn = e.target.closest('[data-au]');
      if (!btn || btn.dataset.au === 'pick') return;
      const act = btn.dataset.au;
      if (act === 'pdf') downloadStanding();
      if (act === 'add-record') openRecordModal('add', null);
      if (act === 'edit') openRecordModal('edit', _records.find(r => r.id === btn.dataset.id));
      if (act === 'del') removeRecord(btn.dataset.id);
    });
  }

  async function pickStudent(id) {
    const ws = document.getElementById('au-workspace');
    ws.classList.remove('hidden');
    ws.innerHTML = '<div class="loading-state">Loading records…</div>';
    ws.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const { profile, records } = await Api.admin.studentUnits(id);
      _student  = profile;
      _records  = records || [];

      const program = programOf(profile);
      if (program) {
        const checklists = await Api.units.checklists(program);
        _requirements = checklists.requirements || [];
        _subjects     = checklists.subjects || [];
      } else {
        _requirements = [];
        _subjects     = [];
      }
      renderWorkspace();
    } catch (err) {
      ws.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="icon-park-outline:caution" class="empty-icon"></iconify-icon>
          <p>${esc(err.message)}</p>
        </div>`;
    }
  }

  // Passed-once math, mirroring the student dashboard's progress card.
  function summary() {
    const program = programOf(_student);
    const req = _requirements.find(r => r.program === program);
    const total = req ? Number(req.total_units) : 0;
    const passedIds = new Set(
      _records.filter(r => r.status === 'passed' && r.subjects?.id).map(r => r.subjects.id)
    );
    const completed = _subjects
      .filter(s => passedIds.has(s.id))
      .reduce((sum, s) => sum + Number(s.units || 0), 0);
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return { total, completed, pct };
  }

  function renderWorkspace() {
    const ws = document.getElementById('au-workspace');
    const program = programOf(_student);
    const { total, completed, pct } = summary();
    const fmtDate = d => d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const rows = _records.map(r => `
      <tr>
        <td><strong>${esc(r.subjects?.code || r.subject_id)}</strong></td>
        <td style="font-size:.82rem;min-width:180px;">${esc(r.subjects?.title || '—')}</td>
        <td style="text-align:center;">${r.subjects?.units ?? '—'}</td>
        <td style="font-size:.8rem;">${esc(r.school_year)}</td>
        <td style="font-size:.8rem;">${SEM_SHORT[r.semester] || r.semester}</td>
        <td><span class="unit-badge unit-badge--${r.status}">${STATUS_LABELS[r.status] || r.status}</span></td>
        <td style="text-align:center;">${r.grade != null ? r.grade : '—'}</td>
        <td style="font-size:.72rem;color:var(--text-tertiary);max-width:160px;">
          ${esc([r.schedule, r.instructor].filter(Boolean).join(' · ') || '—')}
          <br><span style="opacity:.75">by ${esc(r.last_edited_by || '—')} · ${fmtDate(r.updated_at || r.created_at)}</span>
        </td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="tx-action-btn" data-au="edit" data-id="${r.id}" style="font-size:.78rem;padding:.25rem .55rem;margin-right:.25rem;">Edit</button>
          <button class="tx-action-btn" data-au="del" data-id="${r.id}" style="font-size:.78rem;padding:.25rem .55rem;">Remove</button>
        </td>
      </tr>`).join('');

    ws.innerHTML = `
      <div style="border-top:1px solid var(--border-default);margin-top:1rem;padding-top:1rem;">
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:0.75rem;">
          <div>
            <strong>${esc(_student.full_name || '—')}</strong>
            <span style="color:var(--text-secondary);font-size:.82rem;"> · ${esc(PROGRAM_NAMES[program] || _student.course || 'No valid program')} · Enrolled ${esc(String(_student.enrollment_year ?? '—'))}</span>
            <div style="font-size:.82rem;color:var(--text-secondary);margin-top:.15rem;">
              Progress: <strong>${pct}%</strong> (${completed} / ${total || '—'} units)
            </div>
          </div>
          <div style="margin-left:auto;display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-ghost" data-au="pdf" type="button">
              <iconify-icon icon="icon-park-outline:download" style="font-size:1rem;margin-right:.3rem;vertical-align:middle;"></iconify-icon>Standing PDF
            </button>
            <button class="btn btn-primary" data-au="add-record" type="button">Add Record</button>
          </div>
        </div>
        ${_records.length ? `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Code</th><th>Title</th><th>Units</th><th>SY</th><th>Sem</th><th>Status</th><th>Grade</th><th>Detail</th><th style="text-align:center;">Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : `
          <div class="empty-state">No records yet — add the first one with “Add Record”.</div>`}
      </div>`;
  }

  // ---- Standing PDF for the selected student ----
  async function downloadStanding() {
    const token = window._authToken;
    if (!token || !_student) { UI.toast('Please log in again.', 'error'); return; }

    try {
      const res = await fetch(`${window.API_BASE}/api/admin/students/${_student.id}/standing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = res.headers.get('Content-Disposition') || '';
      const name = cd.match(/filename="?([^";]+)"?/);
      a.href     = url;
      a.download = name ? name[1] : 'Academic-Standing.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  return { load };
})();
