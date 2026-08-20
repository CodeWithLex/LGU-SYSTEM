// =============================================
// units.js — Credit Unit Tracker View Module
// =============================================

const Units = (() => {

  let requirements = []; // curriculum_requirements rows (all programs)
  let subjects     = []; // subjects for the current program
  let myUnits      = []; // the student's enrollment records
  let program      = null;

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
  const SEM_LABELS = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer Term' };

  // ---- Small helpers ----
  function currentSchoolYear() {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  function currentSemester() {
    const m = new Date().getMonth() + 1;
    return m >= 6 && m <= 10 ? 1 : 2;
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Keep a hidden select and its custom .dd trigger in sync when we
  // pre-fill modal fields programmatically.
  function setDDValue(select, value) {
    select.value = value;
    const wrap = select.closest('.dd');
    if (wrap) {
      const label = wrap.querySelector('.dd-label');
      const opt = select.options[select.selectedIndex];
      if (label) {
        label.textContent = opt ? opt.text : '';
        label.classList.toggle('dd-placeholder', !(opt && opt.value));
      }
    }
  }

  // ---- Load ----
  async function load() {
    const profile = await Auth.getProfile().catch(() => null);
    if (!program) {
      program = (profile?.course && VALID_PROGRAMS.includes(profile.course))
        ? profile.course
        : 'BSCoE';
    }

    const sel = document.getElementById('units-program');
    if (sel && !sel.dataset.userSet) setDDValue(sel, program);

    try {
      const [checklists, mine] = await Promise.all([
        Api.units.checklists(program),
        Api.units.my(),
      ]);
      requirements = checklists.requirements || [];
      subjects     = checklists.subjects || [];
      myUnits      = mine || [];
      renderProgress(profile);
      renderChecklist();
    } catch (err) {
      document.getElementById('units-checklist').innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="icon-park-outline:caution" class="empty-icon"></iconify-icon>
          <p>${esc(err.message)}</p>
        </div>`;
    }
  }

  // ---- Progress panel ----
  function renderProgress(profile) {
    const req = requirements.find(r => r.program === program);
    const total = req ? Number(req.total_units) : 0;

    // Count units once per subject — a retake that is later passed
    // never double-counts the same subject.
    const passedSubjectIds = new Set(
      myUnits.filter(u => u.status === 'passed' && u.subjects?.id).map(u => u.subjects.id)
    );
    const completed = subjects
      .filter(s => passedSubjectIds.has(s.id))
      .reduce((sum, s) => sum + Number(s.units || 0), 0);

    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

    document.getElementById('units-progress-pct').textContent = `${pct}%`;
    document.getElementById('units-progress-fill').style.width = `${pct}%`;
    document.getElementById('units-completed').textContent = completed;
    document.getElementById('units-total').textContent = total || '—';

    // Estimated graduation cohort: enrollment year + 4 (fallback: current year + 4)
    const created = profile?.created_at ? new Date(profile.created_at) : null;
    const cohort = (created && !isNaN(created)) ? created.getFullYear() + 4 : new Date().getFullYear() + 4;
    document.getElementById('units-cohort-year').textContent = cohort;
  }

  // ---- Checklist ----
  function recordFor(subjectId) {
    // API returns newest first — the first match is the latest record
    return myUnits.find(u => u.subjects?.id === subjectId) || null;
  }

  function renderChecklist() {
    const container = document.getElementById('units-checklist');

    if (!subjects.length) {
      container.innerHTML = `
        <div class="empty-state">
          <iconify-icon icon="icon-park-outline:checklist" class="empty-icon"></iconify-icon>
          <p>No subjects are set up for ${esc(program)} — ${esc(PROGRAM_NAMES[program] || '')} yet.</p>
        </div>`;
      return;
    }

    const years = [1, 2, 3, 4].map(year => {
      const sems = [1, 2, 3].map(sem => ({
        sem,
        subjects: subjects.filter(s => s.year_level === year && s.semester === sem),
      })).filter(s => s.subjects.length);
      return { year, sems };
    }).filter(y => y.sems.length);

    container.innerHTML = years.map(({ year, sems }) => `
      <div class="unit-year">
        <div class="unit-year-banner">Year ${year}</div>
        ${sems.map(({ sem, subjects: list }) => `
          <div class="unit-sem">
            <div class="unit-sem-banner">${SEM_LABELS[sem] || `Semester ${sem}`}</div>
            ${list.map(subjectRow).join('')}
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  function subjectRow(s) {
    const rec = recordFor(s.id);
    const badge = rec
      ? `<span class="unit-badge unit-badge--${rec.status}">${STATUS_LABELS[rec.status]}${rec.grade != null ? ' · ' + rec.grade : ''}</span>`
      : `<span class="unit-badge unit-badge--none">Not taken</span>`;

    const actions = rec
      ? `
        <button class="unit-action-btn" data-act="edit" data-id="${rec.id}" data-subject="${s.id}" title="Edit grade / status"><iconify-icon icon="icon-park-outline:edit"></iconify-icon></button>
        ${rec.status !== 'passed' ? `<button class="unit-action-btn unit-action-btn--pass" data-act="passed" data-id="${rec.id}" title="Mark as passed"><iconify-icon icon="icon-park-outline:check-one"></iconify-icon></button>` : ''}
        <button class="unit-action-btn unit-action-btn--del" data-act="drop" data-id="${rec.id}" title="Remove record"><iconify-icon icon="icon-park-outline:delete"></iconify-icon></button>`
      : `<button class="btn btn-ghost unit-log-btn" data-act="log" data-subject="${s.id}">Log</button>`;

    const prereq = s.prerequisites
      ? `<div class="unit-prereq">Prerequisite: ${esc(s.prerequisites)}</div>`
      : '';

    return `
      <div class="unit-row">
        <span class="unit-code">${esc(s.code)}</span>
        <div class="unit-title">
          <div>${esc(s.title)} <span class="unit-units">${s.units} unit${s.units === 1 ? '' : 's'}</span></div>
          ${prereq}
        </div>
        ${badge}
        <div class="unit-actions">${actions}</div>
      </div>`;
  }

  // ---- Modal ----
  let modalMode = 'create'; // 'create' | 'edit'
  let modalSubject = null;
  let modalRecordId = null;

  function openModal(subject, record) {
    modalSubject = subject;
    modalRecordId = record?.id || null;
    modalMode = record ? 'edit' : 'create';

    document.getElementById('units-modal-title').textContent = record ? 'Edit Subject Record' : 'Log Subject';
    document.getElementById('units-modal-subject').textContent =
      `${subject.code} · ${subject.title} · ${subject.units} unit${subject.units === 1 ? '' : 's'}`;

    setDDValue(document.getElementById('units-sem'), String(record?.semester ?? currentSemester()));
    document.getElementById('units-sy').value = record?.school_year || currentSchoolYear();
    setDDValue(document.getElementById('units-status'), record?.status || 'enrolled');
    document.getElementById('units-grade').value = record?.grade != null ? record.grade : '';

    const errEl = document.getElementById('units-modal-error');
    errEl.classList.add('hidden');
    document.getElementById('units-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('units-modal').classList.add('hidden');
  }

  async function saveModal() {
    const errEl = document.getElementById('units-modal-error');
    errEl.classList.add('hidden');

    const school_year = document.getElementById('units-sy').value.trim();
    const semester = document.getElementById('units-sem').value;
    const status = document.getElementById('units-status').value;
    const gradeRaw = document.getElementById('units-grade').value;

    if (!/^\d{4}-\d{4}$/.test(school_year)) {
      errEl.textContent = 'School year must look like "2026-2027".';
      errEl.classList.remove('hidden');
      return;
    }
    if (gradeRaw !== '' && (Number(gradeRaw) < 1 || Number(gradeRaw) > 5)) {
      errEl.textContent = 'Grade must be between 1.0 and 5.0.';
      errEl.classList.remove('hidden');
      return;
    }

    const body = { school_year, semester: Number(semester), status, grade: gradeRaw === '' ? null : Number(gradeRaw) };

    try {
      if (modalMode === 'edit') {
        await Api.units.update(modalRecordId, body);
        UI.toast('Subject record updated.', 'success');
      } else {
        await Api.units.enroll({ ...body, subject_id: modalSubject.id });
        UI.toast('Subject logged successfully.', 'success');
      }
      closeModal();
      await load();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  async function markPassed(id) {
    if (!confirm('Mark this subject as passed?')) return;
    try {
      await Api.units.update(id, { status: 'passed' });
      UI.toast('Marked as passed.', 'success');
      await load();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  async function dropRecord(id) {
    if (!confirm('Remove this subject record? This cannot be undone.')) return;
    try {
      await Api.units.drop(id);
      UI.toast('Subject record removed.', 'success');
      await load();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  // ---- Event wiring (runs once at script load) ----
  document.getElementById('units-checklist').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const subject = subjects.find(s => s.id === btn.dataset.subject);
    const record = btn.dataset.id ? myUnits.find(u => u.id === btn.dataset.id) : null;

    if (act === 'log' && subject) openModal(subject, null);
    if (act === 'edit' && subject) openModal(subject, record || recordFor(subject.id));
    if (act === 'passed') markPassed(btn.dataset.id);
    if (act === 'drop') dropRecord(btn.dataset.id);
  });

  document.getElementById('units-modal-save').addEventListener('click', saveModal);
  document.getElementById('units-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('units-modal').addEventListener('click', e => {
    if (e.target.id === 'units-modal') closeModal();
  });

  document.getElementById('units-program').addEventListener('change', e => {
    program = e.target.value;
    e.target.dataset.userSet = '1';
    load();
  });

  return { load };
})();
