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
    refreshStudents();
    loadCurriculum();
  }

  // ---- Student search / browse ----
  let _searchTimer = null;

  function bindSearch() {
    document.getElementById('au-search').addEventListener('input', e => {
      clearTimeout(_searchTimer);
      const q = e.target.value.trim();
      if (q.length === 0) { refreshStudents(); return; }
      if (q.length < 2) { document.getElementById('au-results').innerHTML = ''; return; }
      _searchTimer = setTimeout(() => refreshStudents(q), 300);
    });
    document.getElementById('au-filter-program').addEventListener('change', () => refreshStudents());
    // Browse mode: list everyone (filtered by course dropdown) on first open.
    refreshStudents();
  }

  async function refreshStudents(q = '') {
    const box = document.getElementById('au-results');
    box.innerHTML = '<div class="loading-state">Loading students…</div>';
    try {
      const program = document.getElementById('au-filter-program').value;
      const list = await Api.admin.studentsSearch(q, program);
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
          <thead><tr><th>Name</th><th>Email</th><th>Course</th><th>Year</th><th>Role</th><th></th></tr></thead>
          <tbody>
            ${list.map(u => `
              <tr>
                <td><strong>${esc(u.full_name || '—')}</strong></td>
                <td style="font-size:.8rem;color:var(--text-secondary)">${esc(u.email || '—')}</td>
                <td style="font-size:.8rem;">${esc(u.course || '—')}${programOf(u) ? '' : ' <span style="font-size:.65rem;color:var(--status-warning);">(not a COE program)</span>'}</td>
                <td style="font-size:.8rem;">${esc(String(u.year_level ?? '—'))}</td>
                <td>${UI.renderStatusBadge(u.role)}</td>
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

    // A course that doesn't resolve to a COE program (e.g. a typo like
    // "BS Nusring") blocks everything downstream — say so instead of
    // rendering a silently empty workspace.
    const courseWarning = program ? '' : `
      <div style="border:1px solid var(--status-warning);border-radius:var(--radius-sm);padding:0.6rem 0.9rem;margin-bottom:0.75rem;background:rgba(245,158,11,0.08);color:var(--text-primary);font-size:0.82rem;">
        <strong>Course not recognized.</strong> "${esc(_student.course || '—')}" doesn't match any COE program (BSCoE, BSCE, BSECE).
        Records can't be logged and no PDF can be generated until the student's course is corrected.
      </div>`;

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
        ${courseWarning}
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:0.75rem;">
          <div>
            <strong>${esc(_student.full_name || '—')}</strong>
            <span style="color:var(--text-secondary);font-size:.82rem;"> · ${esc(PROGRAM_NAMES[program] || _student.course || 'No valid program')} · Enrolled ${esc(String(_student.enrollment_year ?? '—'))}</span>
            <div style="font-size:.82rem;color:var(--text-secondary);margin-top:.15rem;">
              ${program ? `Progress: <strong>${pct}%</strong> (${completed} / ${total || '—'} units)` : 'Progress: <strong>—</strong> (no valid program)'}
            </div>
          </div>
          ${program ? `
          <div style="margin-left:auto;display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-ghost" data-au="pdf" type="button">
              <iconify-icon icon="icon-park-outline:download" style="font-size:1rem;margin-right:.3rem;vertical-align:middle;"></iconify-icon>Standing PDF
            </button>
            <button class="btn btn-primary" data-au="add-record" type="button">Add Record</button>
          </div>` : ''}
        </div>
        ${_records.length ? `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Code</th><th>Title</th><th>Units</th><th>SY</th><th>Sem</th><th>Status</th><th>Grade</th><th>Detail</th><th style="text-align:center;">Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : `
          <div class="empty-state">No records yet${program ? ' — add the first one with "Add Record"' : ''}.</div>`}
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

  // ---- Record modal (admin add / edit) ----
  let _recordMode   = 'add'; // 'add' | 'edit'
  let _recordEditId = null;

  function bindRecordModal() {
    document.getElementById('au-record-save').addEventListener('click', saveRecordModal);
    document.getElementById('au-record-cancel').addEventListener('click', () => closeModalOverlay('au-record-modal'));
    document.getElementById('au-record-modal').addEventListener('click', e => {
      if (e.target.id === 'au-record-modal') closeModalOverlay('au-record-modal');
    });
  }

  function openRecordModal(mode, record) {
    if (!_student) return;
    _recordMode   = mode;
    _recordEditId = record?.id || null;

    document.getElementById('au-record-title').textContent = mode === 'edit' ? 'Edit Record' : 'Add Record';
    document.getElementById('au-record-student').textContent =
      `${_student.full_name} · ${PROGRAM_NAMES[programOf(_student)] || _student.course || 'No valid program'}`;

    // Subject options: the student's program subjects (student-facing list),
    // plus the record's own subject when editing (it may be archived).
    const subjectSel = document.getElementById('au-record-subject');
    const opts = new Map();
    if (record?.subjects) opts.set(record.subjects.id, record.subjects);
    _subjects.forEach(s => opts.set(s.id, s));
    subjectSel.innerHTML = [...opts.values()]
      .map(s => `<option value="${s.id}">${esc(s.code)} — ${esc(s.title)} (${s.units}u)</option>`).join('');
    subjectSel.value = record?.subject_id || record?.subjects?.id || (opts.size ? [...opts.keys()][0] : '');
    subjectSel.disabled = mode === 'edit'; // the row's subject is fixed; edits change status/grade/details

    document.getElementById('au-record-sy').value   = record?.school_year || currentSchoolYear();
    document.getElementById('au-record-sem').value  = String(record?.semester ?? currentSemester());
    document.getElementById('au-record-status').value = record?.status || 'enrolled';
    document.getElementById('au-record-grade').value  = record?.grade != null ? record.grade : '';
    document.getElementById('au-record-schedule').value   = record?.schedule || '';
    document.getElementById('au-record-instructor').value = record?.instructor || '';
    document.getElementById('au-record-reason').value = '';

    const errEl = document.getElementById('au-record-error');
    errEl.classList.add('hidden');
    openModalOverlay('au-record-modal');
  }

  async function saveRecordModal() {
    if (!_student) return;
    const errEl = document.getElementById('au-record-error');
    errEl.classList.add('hidden');

    const school_year = document.getElementById('au-record-sy').value.trim();
    const subjectId   = document.getElementById('au-record-subject').value;
    const gradeRaw    = document.getElementById('au-record-grade').value;
    const schedule    = document.getElementById('au-record-schedule').value.trim().slice(0, 120);
    const instructor  = document.getElementById('au-record-instructor').value.trim().slice(0, 120);
    const reason      = document.getElementById('au-record-reason').value.trim();

    if (_recordMode === 'add' && !subjectId) {
      errEl.textContent = 'Pick a subject.'; errEl.classList.remove('hidden'); return;
    }
    if (!/^\d{4}-\d{4}$/.test(school_year)) {
      errEl.textContent = 'School year must look like "2026-2027".'; errEl.classList.remove('hidden'); return;
    }
    if (gradeRaw !== '' && (Number(gradeRaw) < 1 || Number(gradeRaw) > 5)) {
      errEl.textContent = 'Grade must be between 1.0 and 5.0.'; errEl.classList.remove('hidden'); return;
    }
    if (reason.length < 5) {
      errEl.textContent = 'A reason of at least 5 characters is required.'; errEl.classList.remove('hidden'); return;
    }

    const body = {
      school_year,
      semester: Number(document.getElementById('au-record-sem').value),
      status: document.getElementById('au-record-status').value,
      grade: gradeRaw === '' ? null : Number(gradeRaw),
      schedule: schedule || null,
      instructor: instructor || null,
      reason,
    };

    try {
      if (_recordMode === 'edit') {
        await Api.admin.updateStudentUnit(_recordEditId, body);
        UI.toast('Record updated.', 'success');
      } else {
        await Api.admin.addStudentUnit(_student.id, { ...body, subject_id: subjectId });
        UI.toast('Record added.', 'success');
      }
      closeModalOverlay('au-record-modal');
      await pickStudent(_student.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  async function removeRecord(id) {
    if (!_student) return;
    const reason = window.prompt('Reason for removing this record (min. 5 characters):');
    if (reason === null) return;
    if (reason.trim().length < 5) { UI.toast('Reason must be at least 5 characters.', 'error'); return; }
    if (!confirm('Remove this record? This cannot be undone.')) return;

    try {
      await Api.admin.deleteStudentUnit(id, { reason: reason.trim() });
      UI.toast('Record removed.', 'success');
      await pickStudent(_student.id);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  // ---- Curriculum Manager ----
  let _subjectEditId = null;

  function bindCurriculum() {
    document.getElementById('au-cur-program').addEventListener('change', e => {
      _currProgram = e.target.value;
      loadCurriculum();
    });
    document.getElementById('au-cur-save').addEventListener('click', saveTotalUnits);
    document.getElementById('au-subject-add').addEventListener('click', () => openSubjectModal(null));

    document.getElementById('au-cur-table').addEventListener('click', e => {
      const btn = e.target.closest('[data-cact]');
      if (!btn) return;
      const subject = _currSubjects.find(s => s.id === btn.dataset.id);
      if (!subject) return;
      if (btn.dataset.cact === 'edit') openSubjectModal(subject);
      if (btn.dataset.cact === 'archive') toggleArchive(subject);
    });
  }

  async function loadCurriculum() {
    const box = document.getElementById('au-cur-table');
    box.innerHTML = '<div class="loading-state">Loading curriculum…</div>';
    try {
      const { requirements, subjects } = await Api.admin.adminSubjects(_currProgram);
      _currSubjects = subjects || [];
      document.getElementById('au-cur-total').value = requirements?.total_units ?? '';
      renderCurriculum();
    } catch (err) {
      box.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="icon-park-outline:caution" class="empty-icon"></iconify-icon>
          <p>${esc(err.message)}</p>
        </div>`;
    }
  }

  function renderCurriculum() {
    const box = document.getElementById('au-cur-table');
    if (!_currSubjects.length) {
      box.innerHTML = '<div class="empty-state">No subjects for this program yet — add the first one.</div>';
      return;
    }

    box.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Title</th><th>Units</th><th>Yr</th><th>Sem</th><th>Prereqs</th><th>Records</th><th>Status</th><th style="text-align:center;">Actions</th></tr></thead>
          <tbody>
            ${_currSubjects.map(s => `
              <tr style="${s.is_archived ? 'opacity:.55;' : ''}">
                <td><strong>${esc(s.code)}</strong>${s.is_elective ? ' <span style="font-size:.65rem;color:var(--text-tertiary);">(elective)</span>' : ''}</td>
                <td style="font-size:.82rem;min-width:180px;">${esc(s.title)}</td>
                <td style="text-align:center;">${s.units}</td>
                <td style="text-align:center;">${s.year_level}</td>
                <td style="font-size:.8rem;">${SEM_SHORT[s.semester] || s.semester}</td>
                <td style="font-size:.75rem;color:var(--text-tertiary);">${esc(s.prerequisites || '—')}</td>
                <td style="text-align:center;">${s.record_count ?? 0}</td>
                <td>${s.is_archived ? '<span class="unit-badge unit-badge--none">Archived</span>' : '<span class="unit-badge unit-badge--passed">Active</span>'}</td>
                <td style="text-align:center;white-space:nowrap;">
                  <button class="tx-action-btn" data-cact="edit" data-id="${s.id}" style="font-size:.78rem;padding:.25rem .55rem;margin-right:.25rem;">Edit</button>
                  <button class="tx-action-btn" data-cact="archive" data-id="${s.id}" style="font-size:.78rem;padding:.25rem .55rem;">${s.is_archived ? 'Unarchive' : 'Archive'}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function bindSubjectModal() {
    document.getElementById('au-subject-save').addEventListener('click', saveSubjectModal);
    document.getElementById('au-subject-cancel').addEventListener('click', () => closeModalOverlay('au-subject-modal'));
    document.getElementById('au-subject-modal').addEventListener('click', e => {
      if (e.target.id === 'au-subject-modal') closeModalOverlay('au-subject-modal');
    });
  }

  function openSubjectModal(subject) {
    _subjectEditId = subject?.id || null;

    document.getElementById('au-subject-modal-title').textContent = subject ? 'Edit Subject' : 'Add Subject';
    document.getElementById('au-subject-modal-sub').textContent =
      `${PROGRAM_NAMES[_currProgram] || _currProgram}${subject?.record_count ? ` · ${subject.record_count} student record(s) reference this subject` : ''}`;

    document.getElementById('au-subject-code').value    = subject?.code || '';
    document.getElementById('au-subject-title').value   = subject?.title || '';
    document.getElementById('au-subject-units').value   = subject?.units ?? '';
    document.getElementById('au-subject-year').value    = String(subject?.year_level ?? 1);
    document.getElementById('au-subject-sem').value     = String(subject?.semester ?? 1);
    document.getElementById('au-subject-prereqs').value = subject?.prerequisites || '';
    document.getElementById('au-subject-elective').checked = !!subject?.is_elective;
    document.getElementById('au-subject-reason').value  = '';

    const errEl = document.getElementById('au-subject-error');
    errEl.classList.add('hidden');
    openModalOverlay('au-subject-modal');
  }

  async function saveSubjectModal() {
    const errEl = document.getElementById('au-subject-error');
    errEl.classList.add('hidden');

    const code    = document.getElementById('au-subject-code').value.trim();
    const title   = document.getElementById('au-subject-title').value.trim();
    const units   = Number(document.getElementById('au-subject-units').value);
    const year    = Number(document.getElementById('au-subject-year').value);
    const sem     = Number(document.getElementById('au-subject-sem').value);
    const prereqs = document.getElementById('au-subject-prereqs').value.trim();
    const elective = document.getElementById('au-subject-elective').checked;
    const reason  = document.getElementById('au-subject-reason').value.trim();

    if (!code || code.length > 20)  { errEl.textContent = 'Subject code is required (max 20 characters).'; errEl.classList.remove('hidden'); return; }
    if (!title || title.length > 120) { errEl.textContent = 'Subject title is required (max 120 characters).'; errEl.classList.remove('hidden'); return; }
    if (!Number.isFinite(units) || units < 0.5 || units > 6) { errEl.textContent = 'Units must be between 0.5 and 6.'; errEl.classList.remove('hidden'); return; }
    if (reason.length < 5) { errEl.textContent = 'A reason of at least 5 characters is required.'; errEl.classList.remove('hidden'); return; }

    const existing = _subjectEditId ? _currSubjects.find(s => s.id === _subjectEditId) : null;
    if (existing && existing.record_count > 0 && Number(existing.units) !== units) {
      if (!confirm(`Warning: ${existing.record_count} student record(s) reference this subject. Changing its units retroactively changes those students' progress computation. Continue?`)) return;
    }

    const body = {
      code, title, units, year_level: year, semester: sem,
      prerequisites: prereqs || null,
      is_elective: elective,
      reason,
    };

    try {
      if (_subjectEditId) {
        await Api.admin.updateSubject(_subjectEditId, body);
        UI.toast('Subject updated.', 'success');
      } else {
        await Api.admin.createSubject({ ...body, program: _currProgram });
        UI.toast('Subject created.', 'success');
      }
      closeModalOverlay('au-subject-modal');
      await loadCurriculum();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  async function toggleArchive(subject) {
    const verb = subject.is_archived ? 'unarchive' : 'archive';
    const reason = window.prompt(`Reason for archiving/unarchiving "${subject.code}" (min. 5 characters):`);
    if (reason === null) return;
    if (reason.trim().length < 5) { UI.toast('Reason must be at least 5 characters.', 'error'); return; }
    if (!confirm(`${verb === 'archive' ? 'Archive' : 'Unarchive'} "${subject.code}"? ${subject.record_count ? `${subject.record_count} existing record(s) will keep it (PDFs stay accurate); students just won't see it in their checklist.` : ''}`)) return;

    try {
      await Api.admin.updateSubject(subject.id, { is_archived: !subject.is_archived, reason: reason.trim() });
      UI.toast(`Subject ${verb}d.`, 'success');
      await loadCurriculum();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  async function saveTotalUnits() {
    const input = document.getElementById('au-cur-total');
    const t = Number(input.value);
    if (!Number.isInteger(t) || t < 1 || t > 500) { UI.toast('Total units must be a whole number between 1 and 500.', 'error'); return; }

    const reason = window.prompt(`Reason for changing total units for ${_currProgram} (min. 5 characters):`);
    if (reason === null) return;
    if (reason.trim().length < 5) { UI.toast('Reason must be at least 5 characters.', 'error'); return; }

    try {
      await Api.admin.updateCurriculum(_currProgram, { total_units: t, reason: reason.trim() });
      UI.toast('Total units saved — students\' progress will recompute.', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  return { load };
})();
