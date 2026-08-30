# Current Semester Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Current Semester" card (currently enrolled courses, with optional schedule/instructor details) to the top of the Academic Progress checklist column, plus a two-tone graduation progress bar.

**Architecture:** No new endpoints. The card filters the already-loaded `/api/units/my` payload client-side to `status === 'enrolled'` rows matching the computed current term. Two new optional text columns (`instructor`, `schedule`) on `student_units` flow through the existing enroll/update endpoints and render as an escaped second line per course row. The progress bar keeps its passed-only green fill and adds a lighter translucent segment behind it for in-progress units.

**Tech Stack:** Vanilla JS IIFE modules (no build step), Express, Supabase (PostgreSQL + RLS), plain CSS in `client/styles/main.css`.

**Spec:** `docs/superpowers/specs/2026-08-22-current-semester-card-design.md`

## Global Constraints

- No new npm dependencies; no build step; vanilla JS and plain CSS only.
- All free text (instructor, schedule) rendered via the existing `esc()` helper in `client/js/units.js:51` before any `innerHTML` interpolation.
- Use only existing CSS custom properties (`--accent`, `--bg-surface`, `--bg-surface-raised`, `--border-default`, `--radius-md`, `--text-primary`, `--text-secondary`, `--text-tertiary`).
- Per-row unit counts display as a plain number (`3`), never `3u` or `3 units`. The word "units" appears only in the card header subtotal.
- The large progress percentage stays **passed-only**; enrolled units are never counted as completed.
- Server-side ownership is always enforced with `.eq('student_id', req.user.id)` - never client-supplied IDs.
- Optional fields: `trim()`, cap at 120 characters, empty → `NULL` (both client and server).
- The repo has **no test framework** - verification is `node --check`, the smoke script in Task 3, and the manual QA checklist in Task 7.
- Commit after every task; conventional commit messages matching repo history (`feat:`, `fix(units):`, `docs:`).

---

### Task 1: Migration 007 - optional detail columns

**Files:**
- Create: `supabase/migrations/007_enrollment_details.sql`

**Interfaces:**
- Consumes: table `public.student_units` (from `supabase/migrations/005_credit_unit_tracker.sql:43`).
- Produces: columns `student_units.instructor TEXT NULL` and `student_units.schedule TEXT NULL` - Tasks 2 and 5 read/write these names verbatim.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/007_enrollment_details.sql` (guards match the re-runnable pattern of `006_enrollment_year.sql`):

```sql
-- =============================================
-- Migration: 007_enrollment_details.sql
-- Adds optional free-text enrollment details to the
-- Credit Unit Tracker: instructor and schedule per
-- student_units row. Both nullable - existing rows are
-- untouched and simply render without a detail line.
--
-- Re-runnable: both column adds are guarded.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'student_units'
      AND column_name  = 'instructor'
  ) THEN
    ALTER TABLE public.student_units
      ADD COLUMN instructor TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'student_units'
      AND column_name  = 'schedule'
  ) THEN
    ALTER TABLE public.student_units
      ADD COLUMN schedule TEXT;
  END IF;
END $$;
```

No RLS policy changes: the existing `student_units` policies (005, lines 84–104) are row-level (`USING (student_id = auth.uid())`), not column-level, so the new columns are automatically covered.

- [ ] **Step 2: Verify the guard logic**

Run: `grep -c "IF NOT EXISTS" supabase/migrations/007_enrollment_details.sql`
Expected: `2` (both column adds guarded → re-runnable).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_enrollment_details.sql
git commit -m "feat(units): migration 007 - optional instructor/schedule columns"
```

---

### Task 2: Server - sanitize helper, `/my` SELECT, enroll/update passthrough

**Files:**
- Modify: `server/routes/units.js` (helper after `isValidGrade` ~line 39; `/my` SELECT line 85; `/enroll` lines 388 + 417–426; `/update` lines 458–476)

**Interfaces:**
- Consumes: columns `instructor`, `schedule` from Task 1.
- Produces: `sanitizeOptionalText(val)` - `null | undefined | '' | whitespace → null`, otherwise trimmed string capped at 120 chars. `/api/units/my` response rows now include `instructor` and `schedule` (strings or `null`) - Task 5 renders them. `POST /api/units/enroll` and `PATCH /api/units/update/:id` accept optional `instructor`/`schedule` body strings - Task 4 sends them.

- [ ] **Step 1: Add the sanitize helper**

In `server/routes/units.js`, immediately after the `isValidGrade` function (ends ~line 39), add:

```js
// Optional free-text details (instructor / schedule): trim, cap at 120
// chars, and normalize empty → NULL so "never filled" == "cleared".
function sanitizeOptionalText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().slice(0, 120);
  return s === '' ? null : s;
}
```

- [ ] **Step 2: Include the fields in `/my`**

Line 85, change the `.select(...)` of the `/my` handler from:

```js
      .select('id, school_year, semester, grade, status, created_at, subjects(id, code, title, units, program, year_level, semester)')
```

to:

```js
      .select('id, school_year, semester, grade, status, created_at, instructor, schedule, subjects(id, code, title, units, program, year_level, semester)')
```

- [ ] **Step 3: Accept the fields in `/enroll`**

Line 388, change the destructure from:

```js
    const { subject_id, school_year, semester, status = 'enrolled', grade = null } = req.body || {};
```

to:

```js
    const { subject_id, school_year, semester, status = 'enrolled', grade = null, instructor = null, schedule = null } = req.body || {};
```

Lines 417–426, change the `.insert({...})` from:

```js
    const { error } = await supabase
      .from('student_units')
      .insert({
        student_id: req.user.id,
        subject_id,
        school_year,
        semester: Number(semester),
        status,
        grade: grade === '' ? null : (grade === null || grade === undefined ? null : Number(grade)),
      });
```

to:

```js
    const { error } = await supabase
      .from('student_units')
      .insert({
        student_id: req.user.id,
        subject_id,
        school_year,
        semester: Number(semester),
        status,
        grade: grade === '' ? null : (grade === null || grade === undefined ? null : Number(grade)),
        instructor: sanitizeOptionalText(instructor),
        schedule: sanitizeOptionalText(schedule),
      });
```

- [ ] **Step 4: Accept the fields in `/update/:id`**

Line 458, change the destructure from:

```js
    const { status, grade, school_year, semester } = req.body || {};
```

to:

```js
    const { status, grade, school_year, semester, instructor, schedule } = req.body || {};
```

After the `if (semester !== undefined) {...}` block (ends ~line 476) and before the `if (Object.keys(updates).length === 0)` check, add:

```js
    if (instructor !== undefined) updates.instructor = sanitizeOptionalText(instructor);
    if (schedule !== undefined)   updates.schedule   = sanitizeOptionalText(schedule);
```

(`undefined` means "not sent" → untouched, so `markPassed`'s `{ status: 'passed' }` body from `client/js/units.js:340` preserves the stored detail fields; `null`/`''` means "cleared".)

- [ ] **Step 5: Verify syntax**

Run: `node --check server/routes/units.js`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add server/routes/units.js
git commit -m "feat(units): optional instructor/schedule through /my, /enroll, /update"
```

---

### Task 3: Smoke test - sanitize behavior + endpoint wiring

**Files:**
- Create: `scripts/smoke-test-units-fields.js`

**Interfaces:**
- Consumes: `sanitizeOptionalText` and the route source of Task 2 (extracted at runtime with the `vm` pattern established by `scripts/smoke-test-standing.js`).
- Produces: a runnable gate - `node scripts/smoke-test-units-fields.js` exits 0 only if sanitization behaves per spec and all three endpoints wire the fields.

- [ ] **Step 1: Write the smoke script**

Create `scripts/smoke-test-units-fields.js`:

```js
// Smoke test for the enrollment optional-detail fields: extracts
// sanitizeOptionalText from the live route source (same vm pattern as
// smoke-test-standing.js) and verifies trim / 120-char cap / empty→null,
// plus static wiring checks that /my, /enroll, and /update carry the
// fields. Run: node scripts/smoke-test-units-fields.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server', 'routes', 'units.js'), 'utf8');

// Brace-matched extraction of a top-level function from the source.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} not found in route source`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`Unterminated function ${name}`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractFn(source, 'sanitizeOptionalText'), sandbox);

let failed = 0;

const cases = [
  [null, null],
  [undefined, null],
  ['', null],
  ['   ', null],
  ['  MWF 9:00–10:00  ', 'MWF 9:00–10:00'],
  ['Engr. Cruz', 'Engr. Cruz'],
  ['x'.repeat(200), 'x'.repeat(120)],
];
for (const [input, expected] of cases) {
  const got = sandbox.sanitizeOptionalText(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} sanitizeOptionalText(${JSON.stringify(input).slice(0, 32)}) -> ${JSON.stringify(got)}`);
}

// Static wiring checks - the SELECT and writes must carry the fields.
const wiring = [
  ['instructor, schedule, subjects(id, code, title, units', '/my SELECT includes instructor + schedule'],
  ['instructor: sanitizeOptionalText(instructor)', '/enroll insert sanitizes instructor'],
  ['schedule: sanitizeOptionalText(schedule)', '/enroll insert sanitizes schedule'],
  ['updates.instructor = sanitizeOptionalText(instructor)', '/update maps instructor'],
  ['updates.schedule = sanitizeOptionalText(schedule)', '/update maps schedule'],
];
for (const [needle, label] of wiring) {
  const ok = source.includes(needle);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
}

if (failed) { console.error(`\n${failed} check(s) FAILED`); process.exit(1); }
console.log('\nAll checks passed.');
```

- [ ] **Step 2: Run it against Task 2's code**

Run: `node scripts/smoke-test-units-fields.js`
Expected: `PASS` on all 12 lines, `All checks passed.`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test-units-fields.js
git commit -m "test(units): smoke script for optional field sanitize + wiring"
```

---

### Task 4: Client - modal inputs for schedule / instructor

**Files:**
- Modify: `client/index.html` (units modal, lines 711–714 - after the Grade `form-group`, before the `#units-modal-error` div)
- Modify: `client/js/units.js` (`openModal` ~line 288, `saveModal` ~lines 303–319)

**Interfaces:**
- Consumes: `POST /api/units/enroll` / `PATCH /api/units/update/:id` body fields `instructor`, `schedule` from Task 2.
- Produces: DOM inputs `#units-schedule`, `#units-instructor` (text, `maxlength="120"`). `openModal` pre-fills them from a record; `saveModal` sends them trimmed-or-null in every enroll/update body. Task 5 reads the persisted values from `/my`.

- [ ] **Step 1: Add the two modal inputs**

In `client/index.html`, between the Grade `form-group` (ends line 714) and `<div class="auth-error hidden" id="units-modal-error"></div>` (line 715), insert:

```html
        <div class="form-row">
          <div class="form-group">
            <label>Schedule <span style="font-weight:400;color:var(--col-text-muted)">(optional)</span></label>
            <input type="text" id="units-schedule" maxlength="120" placeholder="e.g. MWF 9:00–10:00 AM" />
          </div>
          <div class="form-group">
            <label>Instructor <span style="font-weight:400;color:var(--col-text-muted)">(optional)</span></label>
            <input type="text" id="units-instructor" maxlength="120" placeholder="e.g. Engr. Juan Dela Cruz" />
          </div>
        </div>
```

- [ ] **Step 2: Pre-fill in `openModal`**

In `client/js/units.js` `openModal`, after the grade pre-fill line (`document.getElementById('units-grade').value = ...`, line 288), add:

```js
    document.getElementById('units-schedule').value = record?.schedule || '';
    document.getElementById('units-instructor').value = record?.instructor || '';
```

- [ ] **Step 3: Read and send in `saveModal`**

In `client/js/units.js` `saveModal`, after the `gradeRaw` line (line 306), add:

```js
    const schedule   = document.getElementById('units-schedule').value.trim().slice(0, 120);
    const instructor = document.getElementById('units-instructor').value.trim().slice(0, 120);
```

Then change the `body` construction (line 319) from:

```js
    const body = { school_year, semester: Number(semester), status, grade: gradeRaw === '' ? null : Number(gradeRaw) };
```

to:

```js
    const body = {
      school_year,
      semester: Number(semester),
      status,
      grade: gradeRaw === '' ? null : Number(gradeRaw),
      schedule: schedule || null,
      instructor: instructor || null,
    };
```

- [ ] **Step 4: Verify syntax**

Run: `node --check client/js/units.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add client/index.html client/js/units.js
git commit -m "feat(units): optional schedule/instructor inputs in log/edit modal"
```

---

### Task 5: Client - Current Semester card

**Files:**
- Modify: `client/js/units.js` (new functions before `renderChecklist` ~line 164; `renderChecklist` modified at lines 164–199; `SEM_SHORT` constant at line 27)
- Modify: `client/styles/main.css` (new block after the `.units-checklist` rule, ~line 2448)

**Interfaces:**
- Consumes: `/my` payload rows (`u.status`, `u.school_year`, `u.semester`, `u.subjects.{id, code, title, units}`, `u.schedule`, `u.instructor`) from Task 2; `currentSchoolYear()` / `currentSemester()` (`units.js:30-39`); `esc()` (`units.js:51`); `SEM_LABELS` (`units.js:27`).
- Produces: `currentTermRecords()` → array of current-term enrolled rows (also consumed by Task 6); `currentSemesterCard()` → HTML string; `currentCardRow(u)` → HTML string; `SEM_SHORT = { 1: '1st Sem', 2: '2nd Sem', 3: 'Summer' }`. The card prepends to `#units-checklist` inside `renderChecklist` - it is NOT a `.unit-year` element, so the year filter (`applyYearFilter`, line 202) never hides it.

- [ ] **Step 1: Add `SEM_SHORT`**

In `client/js/units.js`, directly under the `SEM_LABELS` line (line 27), add:

```js
  const SEM_SHORT = { 1: '1st Sem', 2: '2nd Sem', 3: 'Summer' };
```

- [ ] **Step 2: Add the card functions**

In `client/js/units.js`, directly above the `// ---- Checklist ----` comment (line 158), add:

```js
  // ---- Current semester card (read-only snapshot of this term) ----
  // Management (edit / drop / mark passed) stays in the year checklist.
  function currentTermRecords() {
    const sy = currentSchoolYear();
    const sem = currentSemester();
    return myUnits.filter(u =>
      u.status === 'enrolled' &&
      u.school_year === sy &&
      Number(u.semester) === sem &&
      u.subjects?.id
    );
  }

  function currentCardRow(u) {
    const s = u.subjects;
    const meta = [u.schedule, u.instructor].filter(Boolean).join(' · ');
    return `
      <div class="units-current-row">
        <span class="unit-code">${esc(s.code)}</span>
        <div class="unit-title">
          <div>${esc(s.title)}</div>
          ${meta ? `<div class="units-current-meta">${esc(meta)}</div>` : ''}
        </div>
        <span class="units-current-count">${s.units}</span>
      </div>`;
  }

  function currentSemesterCard() {
    const rows = [...currentTermRecords()].sort((a, b) =>
      a.subjects.code.localeCompare(b.subjects.code)
    );
    const totalUnits = rows.reduce((sum, u) => sum + Number(u.subjects.units || 0), 0);
    const term = `${SEM_SHORT[currentSemester()]}, AY ${currentSchoolYear()}`;

    const body = rows.length
      ? rows.map(currentCardRow).join('')
      : `<div class="units-current-empty">No courses logged for this semester yet - log them in the checklist below.</div>`;

    return `
      <div class="units-current" id="units-current">
        <div class="units-current-head">
          <h3>Current Semester</h3>
          <span class="units-current-term">${term}</span>
          <span class="units-current-units">${totalUnits} unit${totalUnits === 1 ? '' : 's'}</span>
        </div>
        ${body}
      </div>`;
  }
```

- [ ] **Step 3: Prepend the card in `renderChecklist`**

In `client/js/units.js` `renderChecklist` (line 164), change the opening to compute the card once:

```js
  function renderChecklist() {
    const container = document.getElementById('units-checklist');
    const card = currentSemesterCard();

    if (!subjects.length) {
      container.innerHTML = card + `
        <div class="empty-state">
          <iconify-icon icon="icon-park-outline:checklist" class="empty-icon"></iconify-icon>
          <p>No subjects are set up for ${esc(program)} - ${esc(PROGRAM_NAMES[program] || '')} yet.</p>
        </div>`;
      return;
    }
```

and change the final assignment (line 184) from `container.innerHTML = years.map(...)...` to prepend the same card:

```js
    container.innerHTML = card + years.map(({ year, sems }) => `
      <div class="unit-year" data-year="${year}">
        <div class="unit-year-banner">Year ${year}</div>
        ${sems.map(({ sem, subjects: list }) => `
          <div class="unit-sem">
            <div class="unit-sem-banner">${SEM_LABELS[sem] || `Semester ${sem}`}</div>
            ${list.map(subjectRow).join('')}
          </div>
        `).join('')}
      </div>
    `).join('');
```

- [ ] **Step 4: Add the card CSS**

In `client/styles/main.css`, directly after the `.units-checklist` rule (ends ~line 2448), insert:

```css
/* ---- Current semester card (read-only snapshot above the checklist) ---- */
.units-current {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.units-current-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.6rem 1rem;
  background: var(--bg-surface-raised);
  border-bottom: 1px solid var(--border-default);
}
.units-current-head h3 {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-primary);
}
.units-current-term { font-size: 0.72rem; color: var(--text-secondary); }
.units-current-units {
  margin-left: auto;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.units-current-row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
}
.units-current-row + .units-current-row { border-top: 1px solid var(--border-default); }
.units-current-meta {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  margin-top: 0.15rem;
}
.units-current-count {
  margin-left: auto;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.units-current-empty {
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
```

(`.unit-code` and `.unit-title` are reused from the checklist rows - same metrics, one visual language. `.unit-title` already has `min-width: 0`, so long titles/meta wrap instead of overflowing on mobile.)

- [ ] **Step 5: Verify syntax**

Run: `node --check client/js/units.js`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add client/js/units.js client/styles/main.css
git commit -m "feat(units): current semester card above the year checklist"
```

---

### Task 6: Client - two-tone progress bar

**Files:**
- Modify: `client/index.html` (progress track, lines 426–428)
- Modify: `client/js/units.js` (`renderProgress`, lines 126–156)
- Modify: `client/styles/main.css` (`.units-progress-track` ~line 2390, `.units-progress-fill` ~line 2397)

**Interfaces:**
- Consumes: `currentTermRecords()` from Task 5.
- Produces: DOM elements `#units-progress-progress` (translucent in-progress segment, sits behind the fill) and `#units-progress-caption` (text line under the bar). Width contract: fill = passed-only `pct`%, segment = `min(100, pct + inPct)`%.

- [ ] **Step 1: Add the segment and caption elements**

In `client/index.html`, change lines 426–428 from:

```html
            <div class="units-progress-track">
              <div class="units-progress-fill" id="units-progress-fill" style="width:0%"></div>
            </div>
```

to:

```html
            <div class="units-progress-track">
              <div class="units-progress-fill-progress" id="units-progress-progress" style="width:0%"></div>
              <div class="units-progress-fill" id="units-progress-fill" style="width:0%"></div>
            </div>
            <div class="units-progress-caption" id="units-progress-caption"></div>
```

- [ ] **Step 2: Extend `renderProgress`**

In `client/js/units.js` `renderProgress`, after the `const pct = ...` line (line 139) and before the element updates, add:

```js
    // In-progress: current-term enrolled units render as a lighter
    // segment behind the passed fill - pct stays passed-only.
    const inProgressUnits = currentTermRecords()
      .reduce((sum, u) => sum + Number(u.subjects.units || 0), 0);
    const inPct = total > 0
      ? Math.min(100 - pct, Math.round((inProgressUnits / total) * 100))
      : 0;
```

Then change the element updates (lines 141–144) from:

```js
    document.getElementById('units-progress-pct').textContent = `${pct}%`;
    document.getElementById('units-progress-fill').style.width = `${pct}%`;
    document.getElementById('units-completed').textContent = completed;
    document.getElementById('units-total').textContent = total || '-';
```

to:

```js
    document.getElementById('units-progress-pct').textContent = `${pct}%`;
    document.getElementById('units-progress-fill').style.width = `${pct}%`;
    document.getElementById('units-progress-progress').style.width = `${Math.min(100, pct + inPct)}%`;
    document.getElementById('units-progress-caption').textContent =
      `${completed} / ${total || '-'} units${inProgressUnits > 0 ? ` · ${inProgressUnits} in progress` : ''}`;
    document.getElementById('units-completed').textContent = completed;
    document.getElementById('units-total').textContent = total || '-';
```

- [ ] **Step 3: Layer the bar in CSS**

In `client/styles/main.css`, change `.units-progress-track` (line 2390) to add positioning:

```css
.units-progress-track {
  position: relative;
  height: 12px;
  border-radius: 999px;
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-default);
  overflow: hidden;
}
```

Change `.units-progress-fill` (line 2397) to add `position: relative;` (first line of the rule):

```css
.units-progress-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent) 0%, #ff8c3a 100%);
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.4);
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
```

Immediately after the `.units-progress-fill` rule, add:

```css
/* In-progress extension - translucent, painted under the passed fill
   (earlier in the DOM, and .units-progress-fill is position:relative),
   so the bar reads solid-accent → translucent → track. */
.units-progress-fill-progress {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  height: 100%;
  border-radius: 999px;
  background: rgba(249, 115, 22, 0.22);
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.units-progress-caption {
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check client/js/units.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add client/index.html client/js/units.js client/styles/main.css
git commit -m "feat(units): two-tone progress bar with in-progress segment"
```

---

### Task 7: Apply migration + end-to-end QA

**Files:**
- Modify: none expected (fix-only task; amend/commit fixes if QA finds issues)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: a verified working feature in the running app.

- [ ] **Step 1: Apply migration 007**

Run the SQL of `supabase/migrations/007_enrollment_details.sql` in the Supabase SQL console of the project configured in `.env` (the same place `scripts/apply-tracker-schema.js` points). It is re-runnable, so running it twice is safe.

- [ ] **Step 2: Run all static gates**

```bash
node --check server/routes/units.js
node --check client/js/units.js
node scripts/smoke-test-units-fields.js
```

Expected: no output, no output, `All checks passed.`

- [ ] **Step 3: Manual QA in the browser**

Start the app (`npm run dev`, or the Electron wrapper per `docs/desktop-app.md`), sign in as a student whose profile has a valid program (e.g. BSCoE), open **Academic Progress**, and verify each point from the spec:

1. **Existing rows unaffected** - the card renders; previously logged subjects show no second line (instructor/schedule are null).
2. **Enroll with details** - Log a current-term subject with schedule + instructor: the card row shows the muted second line `schedule · instructor`.
3. **Enroll without details** - Log another subject with both fields blank: row renders with no second line and no placeholder dashes.
4. **One field only** - Edit a record to have only an instructor: second line shows just the instructor, no dangling `·`.
5. **Clear round-trip** - Edit a record to clear both fields: second line disappears (empty → NULL).
6. **Empty state** - Drop every current-term enrolled course: the card shows "No courses logged for this semester yet - log them in the checklist below." and never disappears.
7. **Progress math** - With passed 93, enrolled 24, required 189: big number stays `49%`, bar shows solid fill to 49% plus translucent segment to ~62%, caption reads `93 / 189 units · 24 in progress`. With zero enrolled: caption reads `93 / 189 units`, translucent segment at 0%.
8. **Stale rows excluded** - A row with status `enrolled` but an older school year does not appear in the card and does not add to the in-progress segment (it stays visible in the year checklist).
9. **Year tabs unaffected** - clicking Year 1–4 filters only the checklist; the card stays visible above it.
10. **Mobile** - at ≤768px width: card stacks above the checklist, long titles/meta wrap, unit counts stay right-aligned.
11. **XSS probe** - Log a course with instructor `<img src=x onerror=alert(1)>`: it renders as literal text, never executes.

- [ ] **Step 4: Commit any fixes**

If QA produced fixes:

```bash
git add -A
git commit -m "fix(units): QA fixes for current semester card"
```

If no fixes were needed, record completion in the commit trail of Tasks 1–6 - nothing to commit here.

---

## Self-Review Notes

- **Spec coverage:** migration (Task 1), `/my`+`/enroll`+`/update` (Task 2), sanitize + smoke (Task 3), modal (Task 4), card incl. empty state/plain-number units/escaping (Task 5), two-tone bar + caption + passed-only % (Task 6), QA checklist items 1–8 of the spec (Task 7 step 3). Non-goals untouched.
- **Type consistency:** `currentTermRecords` / `currentSemesterCard` / `currentCardRow` / `SEM_SHORT` / `sanitizeOptionalText` / element IDs (`units-schedule`, `units-instructor`, `units-current`, `units-progress-progress`, `units-progress-caption`) are used identically across tasks.
- **Ordering:** Task 6 consumes `currentTermRecords()` from Task 5 - execute in numbered order. `renderProgress` runs before `renderChecklist` in `load()` (`units.js:114-115`), which is safe because both only read `myUnits` (set at line 113).
