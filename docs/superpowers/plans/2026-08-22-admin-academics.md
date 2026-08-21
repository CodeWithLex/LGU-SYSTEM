# Admin Academic Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins an "Academics" tab to search students, view/correct their subject records with audit trails, generate any student's Standing PDF, and manage curricula (add/edit/archive subjects, edit total units).

**Architecture:** New `server/routes/admin-units.js` (behind `requireAdmin`) provides 10 endpoints; the inline Standing-PDF builder is extracted to `server/lib/standing-pdf.js` shared by the self route and the admin route. New client module `client/js/admin-units.js` renders the tab. Migration 008 adds `subjects.is_archived` and provenance columns on `student_units`.

**Tech Stack:** Express, Supabase (service key — RLS bypassed server-side), vanilla JS SPA, PDFKit.

**Spec:** `docs/superpowers/specs/2026-08-22-admin-academics-design.md`

## Global Constraints

- Every admin mutation requires `reason` (string, trimmed length ≥ 5) enforced server-side, and calls `logAudit(req.user.id, ACTION, details)`.
- Subject hard-delete does not exist anywhere; archive only (`is_archived`).
- Validations mirror student endpoints verbatim: school year `/^\d{4}-\d{4}$/`, grade 1.0–5.0 (`isValidGrade`), status enum `['enrolled','passed','failed','dropped','incomplete']`, `sanitizeOptionalText` (trim, 120 cap, empty→null).
- `GET /api/units/checklists` filters `is_archived = false`; Standing PDFs include archived subjects (no filter).
- All free text rendered client-side must pass an `esc()` HTML-escape helper.
- Audit actions (exact strings): `ADMIN_VIEW_STUDENT_UNITS`, `ADMIN_ADD_STUDENT_UNIT`, `ADMIN_EDIT_STUDENT_UNIT`, `ADMIN_DELETE_STUDENT_UNIT`, `ADMIN_EDIT_SUBJECT`, `ADMIN_ARCHIVE_SUBJECT`, `ADMIN_EDIT_CURRICULUM`, `ADMIN_STANDING_PDF`.
- No test framework — gates are `node --check`, the two smoke scripts, and the final manual QA checklist.
- Commit after every task; repo has no test runner, so "test" steps are syntax checks + smoke runs.

---

### Task 1: Migration 008 — archive flag + provenance columns

**Files:**
- Create: `supabase/migrations/008_admin_academics.sql`

**Interfaces:**
- Produces: `subjects.is_archived BOOLEAN NOT NULL DEFAULT FALSE`, `student_units.last_edited_by TEXT NULL`, `student_units.updated_at TIMESTAMPTZ DEFAULT NOW()` — used by Tasks 3–6.

- [ ] **Step 1: Write the migration** (guarded/re-runnable, pattern of 006/007)

```sql
-- =============================================
-- Migration: 008_admin_academics.sql
-- Admin Academic Management:
--  - subjects.is_archived: archive instead of delete
--  - student_units provenance: who last touched a record and when
-- Re-runnable: all adds are guarded.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE public.subjects
      ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_units' AND column_name = 'last_edited_by'
  ) THEN
    ALTER TABLE public.student_units
      ADD COLUMN last_edited_by TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_units' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.student_units
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
```

- [ ] **Step 2: Verify guards** — Run: `grep -c "IF NOT EXISTS" supabase/migrations/008_admin_academics.sql` → expect `3`.
- [ ] **Step 3: Commit** — `git add supabase/migrations/008_admin_academics.sql && git commit -m "feat(admin): migration 008 — subject archive flag + record provenance"`

---

### Task 2: Extract Standing PDF builder to `server/lib/standing-pdf.js`

**Files:**
- Create: `server/lib/standing-pdf.js`
- Modify: `server/routes/units.js` (the `GET /standing` handler shrinks to fetch + delegate)
- Modify: `scripts/smoke-test-standing.js` (read from the lib)

**Interfaces:**
- Produces: `buildStandingPDF({ fullName, email, enrolledYear, createdAt, studentProgram, subjects, records, total, res })` — called by Task 5's admin endpoint. `enrolledYear` is `Number(profile.enrollment_year) || null`; `createdAt` is the profile's `created_at` string or null; sets `Content-Type/Disposition` and pipes the PDF to `res`.
- Existing gate: `node scripts/smoke-test-standing.js` must still write a PDF after the move.

- [ ] **Step 1: Create the lib** — move the builder block from `server/routes/units.js` (everything from the summary computation after the three fetches down through `doc.end();`) into:

```js
// =============================================
// server/lib/standing-pdf.js — Academic Standing
// PDF transcript, shared by the student self
// route and the admin endpoint.
// =============================================
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PROGRAM_NAMES = {
  BSCoE: 'BS Computer Engineering',
  BSCE:  'BS Civil Engineering',
  BSECE: 'BS Electronics Engineering',
};
const STATUS_LABELS = {
  enrolled: 'Enrolled', passed: 'Passed', failed: 'Failed',
  dropped: 'Dropped', incomplete: 'Incomplete',
};
const SEM_LABELS = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer Term' };
const SEM_SHORT  = { 1: '1st Sem', 2: '2nd Sem', 3: 'Summer' };

function buildStandingPDF({ fullName, email, enrolledYear, createdAt, studentProgram, subjects, records, total, res }) {
  // ── Summary — a passed subject counts once (mirrors the tracker's progress)
  const passedIds = new Set(records.filter(r => r.status === 'passed').map(r => r.subject_id));
  const completed = subjects
    .filter(s => passedIds.has(s.id))
    .reduce((sum, s) => sum + Number(s.units || 0), 0);
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  // Newest record per subject wins (callers store newest first)
  const recordBySubject = new Map();
  records.forEach(r => {
    if (!recordBySubject.has(r.subject_id)) recordBySubject.set(r.subject_id, r);
  });

  const created = createdAt ? new Date(createdAt) : null;
  const gradYear = enrolledYear
    ? enrolledYear + 4
    : (created && !isNaN(created) ? created.getFullYear() + 4 : new Date().getFullYear() + 4);

  /* PASTE: the exact block from server/routes/units.js starting at the
     comment "── Build PDF ──" through "doc.end();" with ONLY these changes:
     1. `req.user.email` → `email` (one occurrence, the Email meta row)
     Everything else (letterhead drawing, colors, meta block, progress bar,
     subject table, summary page, signature block) stays byte-identical,
     including `path.join(__dirname, '../../client/assets/...')` — server/lib
     is the same depth as server/routes, so the asset paths still resolve. */
}

module.exports = { buildStandingPDF };
```

- [ ] **Step 2: Rewrite the self route** in `server/routes/units.js` — replace everything between the program check and the closing catch with fetch + delegate; add `const { buildStandingPDF } = require('../lib/standing-pdf');` to the top requires:

```js
// GET /api/units/standing
// PDF transcript of the student's own academic standing.
router.get('/standing', async (req, res) => {
  try {
    const studentProgram = VALID_PROGRAMS.find(
      p => p.toUpperCase() === String(req.profile?.course || '').trim().toUpperCase()
    );
    if (!studentProgram) {
      return res.status(400).json({ error: 'No enrolled program on your profile — cannot build a standing report.' });
    }

    const [reqRes, subjRes, myRes] = await Promise.all([
      supabase.from('curriculum_requirements').select('*').eq('program', studentProgram).single(),
      supabase.from('subjects').select('*').eq('program', studentProgram)
        .order('year_level', { ascending: true })
        .order('semester',   { ascending: true })
        .order('code',       { ascending: true }),
      supabase.from('student_units').select('*').eq('student_id', req.user.id),
    ]);

    if (reqRes.error || subjRes.error || myRes.error) {
      logError('units/standing', reqRes.error || subjRes.error || myRes.error);
      return res.status(500).json({ error: 'Failed to load standing data.' });
    }

    buildStandingPDF({
      fullName:     req.profile?.full_name || req.user.email || 'Student',
      email:        req.user.email,
      enrolledYear: Number(req.profile?.enrollment_year) || null,
      createdAt:    req.profile?.created_at || null,
      studentProgram,
      subjects:     subjRes.data || [],
      records:      myRes.data || [],
      total:        Number(reqRes.data?.total_units) || 0,
      res,
    });
  } catch (err) {
    logError('units/standing', err);
    res.status(500).json({ error: 'Failed to generate the standing report.' });
  }
});
```

(Delete the now-unused PDFDocument/`fs`/`path` requires from `units.js` only if nothing else in the file uses them — the file has no other PDF/fs/path use.)

- [ ] **Step 3: Update the smoke script** — in `scripts/smoke-test-standing.js`: read `server/lib/standing-pdf.js` instead of the route; keep the same `const doc = new PDFDocument` … `doc.end();` extraction (the block now lives inside the lib function, after the summary computations above); adjust the sandbox: remove `req` and `gradYear`, add `email: 'juan@corjesu.edu.ph'`, `createdAt: '2022-08-01'`, and set `__dirname: path.join(root, 'server', 'lib')`.

- [ ] **Step 4: Run gates** — `node --check server/lib/standing-pdf.js && node --check server/routes/units.js && node scripts/smoke-test-standing.js` → PDF written, exit 0. Delete the emitted `scripts/standing-smoke.pdf`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor(units): extract standing PDF builder into shared lib"`

---

### Task 3: Provenance stamping in student self-service routes

**Files:**
- Modify: `server/routes/units.js` (`POST /enroll` insert, `PATCH /update/:id` updates)

**Interfaces:**
- Produces: every student write sets `last_edited_by` (student's email) and `updated_at` (ISO now) — Task 5 admin writes use the same columns.

- [ ] **Step 1: Stamp the enroll insert** — inside the `.insert({...})` object add two lines after `schedule: sanitizeOptionalText(schedule),`:

```js
        last_edited_by: req.user.email,
        updated_at: new Date().toISOString(),
```

- [ ] **Step 2: Stamp the update handler** — in `PATCH /update/:id`, after the `schedule` mapping line add:

```js
    updates.last_edited_by = req.user.email;
    updates.updated_at = new Date().toISOString();
```

(Always stamped, including status-only bodies like mark-passed — provenance on every write.)

- [ ] **Step 3: Gates + commit** — `node --check server/routes/units.js && node scripts/smoke-test-units-fields.js` then `git add server/routes/units.js && git commit -m "feat(units): stamp last_edited_by/updated_at on student writes"`

---

### Task 4: `admin-units.js` — students search, records read, admin Standing PDF

**Files:**
- Create: `server/routes/admin-units.js`
- Modify: `server/index.js` (mount, next to the admin router at line ~155)

**Interfaces:**
- Consumes: `buildStandingPDF` from Task 2; `logAudit`; `requireAdmin` (re-declared locally, same as admin.js).
- Produces: `GET /api/admin/students?q=` → `[{id, full_name, email, course, year_level, enrollment_year}]`; `GET /api/admin/students/:id/units` → `{profile, records}` where records carry `subjects(...)` join + provenance; `GET /api/admin/students/:id/standing` → PDF. File header declares validators reused by Task 5.

- [ ] **Step 1: Create the route file** with header + read endpoints:

```js
// =============================================
// server/routes/admin-units.js — Admin Academic
// Management: student records override, standing
// PDFs, curriculum/subject management.
// =============================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { isValidEnum, isValidUUID } = require('../lib/validate');
const { logAudit } = require('../lib/audit');
const { logError } = require('../lib/logger');
const { buildStandingPDF } = require('../lib/standing-pdf');

const VALID_PROGRAMS = ['BSCoE', 'BSCE', 'BSECE'];
const VALID_STATUSES = ['enrolled', 'passed', 'failed', 'dropped', 'incomplete'];
const SCHOOL_YEAR_RE = /^\d{4}-\d{4}$/;

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}
router.use(requireAdmin);

function isValidGrade(val) {
  if (val === null || val === undefined || val === '') return true;
  const n = Number(val);
  return Number.isFinite(n) && n >= 1 && n <= 5;
}

function sanitizeOptionalText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().slice(0, 120);
  return s === '' ? null : s;
}

function isValidReason(reason) {
  return typeof reason === 'string' && reason.trim().length >= 5;
}

function resolveProgram(course) {
  return VALID_PROGRAMS.find(
    p => p.toUpperCase() === String(course || '').trim().toUpperCase()
  ) || null;
}

// ── GET /api/admin/students?q= ─────────────────────────────────────────
router.get('/students', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.status(400).json({ error: 'Enter at least 2 characters to search.' });

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, course, year_level, enrollment_year')
      .eq('role', 'student')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .order('full_name')
      .limit(20);

    if (error) { logError('admin/students', error); return res.status(500).json({ error: 'Failed to search students.' }); }
    res.json(data || []);
  } catch (err) {
    logError('admin/students', err);
    res.status(500).json({ error: 'Failed to search students.' });
  }
});

// ── GET /api/admin/students/:id/units ─────────────────────────────────
router.get('/students/:id/units', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid student id.' });

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, course, year_level, enrollment_year, created_at')
      .eq('id', id).single();
    if (pErr || !profile) return res.status(404).json({ error: 'Student not found.' });

    const { data: records, error: rErr } = await supabase
      .from('student_units')
      .select('id, subject_id, school_year, semester, grade, status, instructor, schedule, last_edited_by, updated_at, created_at, subjects(id, code, title, units, program, year_level, semester, is_archived)')
      .eq('student_id', id)
      .order('created_at', { ascending: false });
    if (rErr) { logError('admin/student-units', rErr); return res.status(500).json({ error: 'Failed to load records.' }); }

    logAudit(req.user.id, 'ADMIN_VIEW_STUDENT_UNITS', { target_user_id: id, user_name: profile.full_name });
    res.json({ profile, records: records || [] });
  } catch (err) {
    logError('admin/student-units', err);
    res.status(500).json({ error: 'Failed to load records.' });
  }
});

// ── GET /api/admin/students/:id/standing ──────────────────────────────
router.get('/students/:id/standing', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid student id.' });

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*').eq('id', id).single();
    if (pErr || !profile) return res.status(404).json({ error: 'Student not found.' });

    const studentProgram = resolveProgram(profile.course);
    if (!studentProgram) {
      return res.status(400).json({ error: 'This student has no valid enrolled program — cannot build a standing report.' });
    }

    const [reqRes, subjRes, myRes] = await Promise.all([
      supabase.from('curriculum_requirements').select('*').eq('program', studentProgram).single(),
      supabase.from('subjects').select('*').eq('program', studentProgram)
        .order('year_level', { ascending: true })
        .order('semester',   { ascending: true })
        .order('code',       { ascending: true }),
      supabase.from('student_units').select('*').eq('student_id', id),
    ]);
    if (reqRes.error || subjRes.error || myRes.error) {
      logError('admin/standing', reqRes.error || subjRes.error || myRes.error);
      return res.status(500).json({ error: 'Failed to load standing data.' });
    }

    logAudit(req.user.id, 'ADMIN_STANDING_PDF', { target_user_id: id, user_name: profile.full_name });
    buildStandingPDF({
      fullName:     profile.full_name || profile.email || 'Student',
      email:        profile.email,
      enrolledYear: Number(profile.enrollment_year) || null,
      createdAt:    profile.created_at || null,
      studentProgram,
      subjects:     subjRes.data || [],
      records:      myRes.data || [],
      total:        Number(reqRes.data?.total_units) || 0,
      res,
    });
  } catch (err) {
    logError('admin/standing', err);
    res.status(500).json({ error: 'Failed to generate the standing report.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount it** — in `server/index.js` after the `adminRouter` require add `const adminUnitsRouter = require("./routes/admin-units");` and after the `/api/admin` mount add:

```js
app.use("/api/admin", authMiddleware, onlyWrites(writeLimiter), adminUnitsRouter);
```

- [ ] **Step 3: Gates + commit** — `node --check server/routes/admin-units.js && node --check server/index.js` then `git add -A && git commit -m "feat(admin): student search, records read, admin standing PDF endpoints"`

---

### Task 5: `admin-units.js` — record mutations (reason-gated, audited)

**Files:**
- Modify: `server/routes/admin-units.js` (append before `module.exports`)

**Interfaces:**
- Consumes: validators from Task 4 (`isValidGrade`, `sanitizeOptionalText`, `isValidReason`, `SCHOOL_YEAR_RE`, `VALID_STATUSES`, `resolveProgram`).
- Produces: `POST /api/admin/students/:id/units`, `PATCH /api/admin/units/:recordId`, `DELETE /api/admin/units/:recordId` — bodies `{subject_id?, school_year?, semester?, status?, grade?, instructor?, schedule?, reason}` (reason always required).

- [ ] **Step 1: Append the three handlers**

```js
// ── POST /api/admin/students/:id/units ────────────────────────────────
router.post('/students/:id/units', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid student id.' });

    const { subject_id, school_year, semester, status = 'enrolled', grade = null, instructor = null, schedule = null, reason } = req.body || {};
    if (!isValidReason(reason)) return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
    if (!isValidUUID(subject_id))          return res.status(400).json({ error: 'Invalid subject id.' });
    if (!SCHOOL_YEAR_RE.test(school_year)) return res.status(400).json({ error: 'School year must look like "2026-2027".' });
    if (![1, 2, 3].includes(Number(semester))) return res.status(400).json({ error: 'Semester must be 1, 2, or 3 (summer).' });
    if (!isValidEnum(status, VALID_STATUSES))  return res.status(400).json({ error: 'Invalid status.' });
    if (!isValidGrade(grade))                  return res.status(400).json({ error: 'Grade must be between 1.0 and 5.0.' });

    const [{ data: profile, error: pErr }, { data: subject, error: sErr }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, course').eq('id', id).single(),
      supabase.from('subjects').select('id, code, program').eq('id', subject_id).single(),
    ]);
    if (pErr || !profile)  return res.status(404).json({ error: 'Student not found.' });
    if (sErr || !subject)  return res.status(404).json({ error: 'Subject not found.' });

    const studentProgram = resolveProgram(profile.course);
    if (!studentProgram || subject.program !== studentProgram) {
      return res.status(403).json({ error: 'The subject does not belong to this student\'s program.' });
    }

    const { error } = await supabase.from('student_units').insert({
      student_id: id,
      subject_id,
      school_year,
      semester: Number(semester),
      status,
      grade: grade === '' ? null : (grade === null || grade === undefined ? null : Number(grade)),
      instructor: sanitizeOptionalText(instructor),
      schedule: sanitizeOptionalText(schedule),
      last_edited_by: req.user.email,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'This subject is already logged for that school year and semester.' });
      logError('admin/add-student-unit', error);
      return res.status(500).json({ error: 'Failed to add the record.' });
    }

    logAudit(req.user.id, 'ADMIN_ADD_STUDENT_UNIT', {
      target_user_id: id, user_name: profile.full_name,
      subject_code: subject.code, reason: reason.trim().slice(0, 300),
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    logError('admin/add-student-unit', err);
    res.status(500).json({ error: 'Failed to add the record.' });
  }
});

// ── PATCH /api/admin/units/:recordId ──────────────────────────────────
router.patch('/units/:recordId', async (req, res) => {
  try {
    const rid = req.params.recordId;
    if (!isValidUUID(rid)) return res.status(400).json({ error: 'Invalid record id.' });

    const { status, grade, school_year, semester, instructor, schedule, reason } = req.body || {};
    if (!isValidReason(reason)) return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });

    const { data: existing, error: fetchErr } = await supabase
      .from('student_units')
      .select('id, student_id, subject_id, subjects(code), profiles(full_name)')
      .eq('id', rid).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Record not found.' });

    const updates = {};
    if (status !== undefined) {
      if (!isValidEnum(status, VALID_STATUSES)) return res.status(400).json({ error: 'Invalid status.' });
      updates.status = status;
    }
    if (grade !== undefined) {
      if (!isValidGrade(grade)) return res.status(400).json({ error: 'Grade must be between 1.0 and 5.0.' });
      updates.grade = grade === '' ? null : Number(grade);
    }
    if (school_year !== undefined) {
      if (!SCHOOL_YEAR_RE.test(school_year)) return res.status(400).json({ error: 'School year must look like "2026-2027".' });
      updates.school_year = school_year;
    }
    if (semester !== undefined) {
      if (![1, 2, 3].includes(Number(semester))) return res.status(400).json({ error: 'Semester must be 1, 2, or 3 (summer).' });
      updates.semester = Number(semester);
    }
    if (instructor !== undefined) updates.instructor = sanitizeOptionalText(instructor);
    if (schedule !== undefined) updates.schedule = sanitizeOptionalText(schedule);
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    updates.last_edited_by = req.user.email;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from('student_units').update(updates).eq('id', rid);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Another record already exists for that school year and semester.' });
      logError('admin/edit-student-unit', error);
      return res.status(500).json({ error: 'Failed to update the record.' });
    }

    logAudit(req.user.id, 'ADMIN_EDIT_STUDENT_UNIT', {
      target_user_id: existing.student_id,
      subject_code: existing.subjects?.code,
      reason: reason.trim().slice(0, 300),
    });
    res.json({ ok: true });
  } catch (err) {
    logError('admin/edit-student-unit', err);
    res.status(500).json({ error: 'Failed to update the record.' });
  }
});

// ── DELETE /api/admin/units/:recordId ─────────────────────────────────
router.delete('/units/:recordId', async (req, res) => {
  try {
    const rid = req.params.recordId;
    if (!isValidUUID(rid)) return res.status(400).json({ error: 'Invalid record id.' });

    const { reason } = req.body || {};
    if (!isValidReason(reason)) return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });

    const { data: existing, error: fetchErr } = await supabase
      .from('student_units')
      .select('id, student_id, subjects(code)')
      .eq('id', rid).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Record not found.' });

    const { error } = await supabase.from('student_units').delete().eq('id', rid);
    if (error) { logError('admin/delete-student-unit', error); return res.status(500).json({ error: 'Failed to remove the record.' }); }

    logAudit(req.user.id, 'ADMIN_DELETE_STUDENT_UNIT', {
      target_user_id: existing.student_id,
      subject_code: existing.subjects?.code,
      reason: reason.trim().slice(0, 300),
    });
    res.json({ ok: true });
  } catch (err) {
    logError('admin/delete-student-unit', err);
    res.status(500).json({ error: 'Failed to remove the record.' });
  }
});
```

Note: the `subjects(code)` / `profiles(full_name)` embedded joins in the pre-fetch SELECTs require FK relationships in PostgREST — `student_units.subjects` and `student_units.profiles` are not declared FKs (profiles.id is referenced by student_units.student_id but check 005: it uses `references profiles(id)` — it IS an FK; subjects likewise). If the embed errors at runtime, fall back to two `.single()` fetches by `subject_id`/`student_id` — the manual QA step covers this.

- [ ] **Step 2: Gates + commit** — `node --check server/routes/admin-units.js` then `git add server/routes/admin-units.js && git commit -m "feat(admin): reason-gated record mutations with audit trail"`

---

### Task 6: `admin-units.js` — subjects CRUD, curriculum units, checklist filter

**Files:**
- Modify: `server/routes/admin-units.js` (append subjects/curriculum endpoints + GET /subjects listing)
- Modify: `server/routes/units.js` (`GET /checklists` gains `.eq('is_archived', false)`)

**Interfaces:**
- Produces: `GET /api/admin/subjects?program=BSCoE` → `{requirements, subjects}` (all incl. archived, with `record_count` per subject); `POST /api/admin/subjects`; `PATCH /api/admin/subjects/:id` (archived flag allowed → `ADMIN_ARCHIVE_SUBJECT`, other fields → `ADMIN_EDIT_SUBJECT`); `PATCH /api/admin/curriculum/:program` (`{total_units, reason}` → `ADMIN_EDIT_CURRICULUM`).

- [ ] **Step 1: Append subjects endpoints**

```js
// ── GET /api/admin/subjects?program=BSCoE ─────────────────────────────
router.get('/subjects', async (req, res) => {
  try {
    const program = req.query.program;
    if (!isValidEnum(program, VALID_PROGRAMS)) return res.status(400).json({ error: 'Invalid program.' });

    const [reqRes, subjRes] = await Promise.all([
      supabase.from('curriculum_requirements').select('*').eq('program', program).single(),
      supabase.from('subjects').select('*').eq('program', program)
        .order('year_level', { ascending: true })
        .order('semester',   { ascending: true })
        .order('code',       { ascending: true }),
    ]);
    if (reqRes.error || subjRes.error) {
      logError('admin/subjects', reqRes.error || subjRes.error);
      return res.status(500).json({ error: 'Failed to load the curriculum.' });
    }

    const subjects = subjRes.data || [];
    const ids = subjects.map(s => s.id);
    const counts = {};
    if (ids.length) {
      const { data: refs } = await supabase
        .from('student_units')
        .select('subject_id')
        .in('subject_id', ids);
      (refs || []).forEach(r => { counts[r.subject_id] = (counts[r.subject_id] || 0) + 1; });
    }
    subjects.forEach(s => { s.record_count = counts[s.id] || 0; });

    res.json({ requirements: reqRes.data, subjects });
  } catch (err) {
    logError('admin/subjects', err);
    res.status(500).json({ error: 'Failed to load the curriculum.' });
  }
});

// ── POST /api/admin/subjects ──────────────────────────────────────────
router.post('/subjects', async (req, res) => {
  try {
    const { program, code, title, units, year_level, semester, prerequisites = null, is_elective = false, reason } = req.body || {};
    if (!isValidReason(reason)) return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
    if (!isValidEnum(program, VALID_PROGRAMS)) return res.status(400).json({ error: 'Invalid program.' });
    if (!code || String(code).trim().length > 20) return res.status(400).json({ error: 'Subject code is required (max 20 characters).' });
    if (!title || String(title).trim().length > 120) return res.status(400).json({ error: 'Subject title is required (max 120 characters).' });
    const u = Number(units);
    if (!Number.isFinite(u) || u < 0.5 || u > 6) return res.status(400).json({ error: 'Units must be between 0.5 and 6.' });
    if (![1, 2, 3, 4].includes(Number(year_level))) return res.status(400).json({ error: 'Year level must be 1–4.' });
    if (![1, 2, 3].includes(Number(semester))) return res.status(400).json({ error: 'Semester must be 1, 2, or 3 (summer).' });

    const { error } = await supabase.from('subjects').insert({
      program, code: String(code).trim().toUpperCase(), title: String(title).trim(),
      units: u, year_level: Number(year_level), semester: Number(semester),
      prerequisites: prerequisites ? String(prerequisites).trim().slice(0, 240) : null,
      is_elective: !!is_elective,
    });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That subject code already exists for this program.' });
      logError('admin/create-subject', error);
      return res.status(500).json({ error: 'Failed to create the subject.' });
    }

    logAudit(req.user.id, 'ADMIN_EDIT_SUBJECT', { program, subject_code: String(code).trim().toUpperCase(), created: true, reason: reason.trim().slice(0, 300) });
    res.status(201).json({ ok: true });
  } catch (err) {
    logError('admin/create-subject', err);
    res.status(500).json({ error: 'Failed to create the subject.' });
  }
});

// ── PATCH /api/admin/subjects/:id ─────────────────────────────────────
router.patch('/subjects/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid subject id.' });

    const { code, title, units, year_level, semester, prerequisites, is_elective, is_archived, reason } = req.body || {};
    if (!isValidReason(reason)) return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });

    const { data: subject, error: fErr } = await supabase
      .from('subjects').select('id, code, program, is_archived').eq('id', id).single();
    if (fErr || !subject) return res.status(404).json({ error: 'Subject not found.' });

    const updates = {};
    if (code !== undefined) {
      if (!code || String(code).trim().length > 20) return res.status(400).json({ error: 'Subject code is required (max 20 characters).' });
      updates.code = String(code).trim().toUpperCase();
    }
    if (title !== undefined) {
      if (!title || String(title).trim().length > 120) return res.status(400).json({ error: 'Subject title is required (max 120 characters).' });
      updates.title = String(title).trim();
    }
    if (units !== undefined) {
      const u = Number(units);
      if (!Number.isFinite(u) || u < 0.5 || u > 6) return res.status(400).json({ error: 'Units must be between 0.5 and 6.' });
      updates.units = u;
    }
    if (year_level !== undefined) {
      if (![1, 2, 3, 4].includes(Number(year_level))) return res.status(400).json({ error: 'Year level must be 1–4.' });
      updates.year_level = Number(year_level);
    }
    if (semester !== undefined) {
      if (![1, 2, 3].includes(Number(semester))) return res.status(400).json({ error: 'Semester must be 1, 2, or 3 (summer).' });
      updates.semester = Number(semester);
    }
    if (prerequisites !== undefined) updates.prerequisites = prerequisites ? String(prerequisites).trim().slice(0, 240) : null;
    if (is_elective !== undefined) updates.is_elective = !!is_elective;
    if (is_archived !== undefined) updates.is_archived = !!is_archived;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    const { error } = await supabase.from('subjects').update(updates).eq('id', id);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That subject code already exists for this program.' });
      logError('admin/edit-subject', error);
      return res.status(500).json({ error: 'Failed to update the subject.' });
    }

    if (is_archived !== undefined) {
      logAudit(req.user.id, 'ADMIN_ARCHIVE_SUBJECT', { subject_code: subject.code, program: subject.program, archived: !!is_archived, reason: reason.trim().slice(0, 300) });
    }
    const dataKeys = Object.keys(updates).filter(k => k !== 'is_archived');
    if (dataKeys.length) {
      logAudit(req.user.id, 'ADMIN_EDIT_SUBJECT', { subject_code: updates.code || subject.code, program: subject.program, fields: dataKeys, reason: reason.trim().slice(0, 300) });
    }
    res.json({ ok: true });
  } catch (err) {
    logError('admin/edit-subject', err);
    res.status(500).json({ error: 'Failed to update the subject.' });
  }
});

// ── PATCH /api/admin/curriculum/:program ──────────────────────────────
router.patch('/curriculum/:program', async (req, res) => {
  try {
    const program = req.params.program;
    if (!isValidEnum(program, VALID_PROGRAMS)) return res.status(400).json({ error: 'Invalid program.' });

    const { total_units, reason } = req.body || {};
    if (!isValidReason(reason)) return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
    const t = Number(total_units);
    if (!Number.isInteger(t) || t < 1 || t > 500) return res.status(400).json({ error: 'Total units must be a whole number between 1 and 500.' });

    const { error } = await supabase.from('curriculum_requirements').update({ total_units: t }).eq('program', program);
    if (error) { logError('admin/edit-curriculum', error); return res.status(500).json({ error: 'Failed to update total units.' }); }

    logAudit(req.user.id, 'ADMIN_EDIT_CURRICULUM', { program, total_units: t, reason: reason.trim().slice(0, 300) });
    res.json({ ok: true });
  } catch (err) {
    logError('admin/edit-curriculum', err);
    res.status(500).json({ error: 'Failed to update total units.' });
  }
});
```

- [ ] **Step 2: Filter archived in the student checklist** — in `server/routes/units.js` `GET /checklists`, after `.order('code', { ascending: true })` add:

```js
      .eq('is_archived', false)
```

(Only the student-facing `checklists` route; the standing routes and admin listing stay unfiltered.)

- [ ] **Step 3: Gates + commit** — `node --check server/routes/admin-units.js && node --check server/routes/units.js` then `git add -A && git commit -m "feat(admin): subject CRUD, archive, curriculum units + hide archived from checklist"`

---

### Task 7: API wrappers + Academics tab markup + wiring

**Files:**
- Modify: `client/js/api.js` (extend `admin`)
- Modify: `client/index.html` (tab button, panel skeleton, record modal, subject modal, script tag)
- Modify: `client/js/admin.js` (`switchTab` hook)

**Interfaces:**
- Produces: `Api.admin.{studentsSearch, studentUnits, addStudentUnit, updateStudentUnit, deleteStudentUnit, adminSubjects, createSubject, updateSubject, updateCurriculum}`; DOM ids `au-*`; global `AdminUnits` loaded lazily via `switchTab('academics')`.

- [ ] **Step 1: api.js** — inside the `admin` object add:

```js
    studentsSearch:      (q)      => _request('GET',   `/admin/students?q=${encodeURIComponent(q)}`),
    studentUnits:        (id)     => _request('GET',   `/admin/students/${id}/units`),
    addStudentUnit:      (id, b)  => _request('POST',  `/admin/students/${id}/units`, b),
    updateStudentUnit:   (rid, b) => _request('PATCH', `/admin/units/${rid}`, b),
    deleteStudentUnit:   (rid, b) => _request('DELETE',`/admin/units/${rid}`, b),
    adminSubjects:       (p)      => _request('GET',   `/admin/subjects?program=${encodeURIComponent(p)}`),
    createSubject:       (b)      => _request('POST',  `/admin/subjects`, b),
    updateSubject:       (id, b)  => _request('PATCH', `/admin/subjects/${id}`, b),
    updateCurriculum:    (p, b)   => _request('PATCH', `/admin/curriculum/${encodeURIComponent(p)}`, b),
```

- [ ] **Step 2: index.html tab button** — as the FIRST `.admin-tab-btn` (before "Create Records"):

```html
          <button class="admin-tab-btn" data-tab="academics" style="display:flex;align-items:center;gap:0.4rem;"><iconify-icon icon="icon-park-outline:checklist" style="font-size:16px" ></iconify-icon> Academics</button>
```

- [ ] **Step 3: index.html panel** — immediately after `<div class="admin-tab-panel active" id="admin-tab-create">`'s closing tag (i.e. as a sibling panel before it):

```html
        <!-- Tab: Academics -->
        <div class="admin-tab-panel" id="admin-tab-academics">
          <div class="dashboard-card">
            <h3><iconify-icon icon="icon-park-outline:people"></iconify-icon> Student Records</h3>
            <p style="color:var(--col-text-muted);font-size:0.85rem;margin-bottom:1rem;">Search a student to view and correct their academic records.</p>
            <div class="form-group">
              <input type="text" id="au-search" placeholder="Search by name or email (min. 2 characters)…" />
            </div>
            <div id="au-results"></div>
            <div id="au-workspace" class="hidden"></div>
          </div>
          <div class="dashboard-card">
            <h3><iconify-icon icon="icon-park-outline:checklist"></iconify-icon> Curriculum Manager</h3>
            <p style="color:var(--col-text-muted);font-size:0.85rem;margin-bottom:1rem;">Add, edit, or archive subjects per program. Archived subjects keep existing records but disappear from student checklists.</p>
            <div class="form-row">
              <div class="form-group">
                <label>Program</label>
                <select id="au-cur-program">
                  <option value="BSCoE">Computer Engineering</option>
                  <option value="BSCE">Civil Engineering</option>
                  <option value="BSECE">Electronics Engineering</option>
                </select>
              </div>
              <div class="form-group">
                <label>Total Units Required</label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                  <input type="number" id="au-cur-total" min="1" max="500" step="1" style="max-width:120px" />
                  <button class="btn btn-ghost" id="au-cur-save" type="button">Save Total</button>
                </div>
              </div>
              <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-primary" id="au-subject-add" type="button">Add Subject</button>
              </div>
            </div>
            <div id="au-cur-table"><div class="loading-state">Loading curriculum…</div></div>
          </div>
        </div>
```

- [ ] **Step 4: index.html modals** — after the `#units-current-modal` block, add record + subject modals (same overlay/card/button structure as `#units-modal`; record modal fields: `au-record-subject` select, `au-record-sy`, `au-record-sem` select (1/2/3), `au-record-status` select, `au-record-grade`, `au-record-schedule`, `au-record-instructor`, `au-record-reason`, `au-record-error`, title `au-record-title`, subtitle `au-record-student`, save `au-record-save`, cancel `au-record-cancel`; subject modal fields: `au-subject-code`, `au-subject-title`, `au-subject-units`, `au-subject-year` select (1–4), `au-subject-sem` select (1–3), `au-subject-prereqs`, `au-subject-elective` checkbox, `au-subject-reason`, `au-subject-error`, title `au-subject-modal-title`, save `au-subject-save`, cancel `au-subject-cancel`). Also add `<script src="js/admin-units.js"></script>` between `admin.js` and `app.js` (line ~946).

- [ ] **Step 5: admin.js hook** — in `switchTab`, after `if (tab === 'audit') loadAuditLog();` add:

```js
    if (tab === 'academics' && window.AdminUnits) AdminUnits.load();
```

- [ ] **Step 6: Gates + commit** — `node --check client/js/api.js && node --check client/js/admin.js` then `git add -A && git commit -m "feat(admin): academics tab markup, modals, and API wrappers"`

---

### Task 8: `admin-units.js` — Student Records card

**Files:**
- Create: `client/js/admin-units.js`

**Interfaces:**
- Consumes: `Api.admin.*` from Task 7; `Api.units.checklists(program)` for summary math; `UI.toast`.
- Produces: global `AdminUnits` with `load()`; internal state `{ _student, _records, _subjects, _requirements, _recordCtx }` consumed by Task 9; renders into `#au-search`, `#au-results`, `#au-workspace`.

- [ ] **Step 1: Create the module** — header, state, helpers (`esc`, `SEM_LABELS`, `STATUS_LABELS`, `VALID_PROGRAMS`), `load()` binding search input (debounced 300ms, min 2 chars) + workspace events (delegated `data-au` actions: `pdf`, `add`, `edit:<id>`, `del:<id>`), `searchStudents`, `renderResults` (list buttons `data-au="pick" data-id`), `pickStudent` (fetch `Api.admin.studentUnits` + `Api.units.checklists(programOf(student))` in parallel → render workspace), `renderWorkspace` (header: name/email/program/enrollment year + progress % and completed/total units via passed-once math mirroring `units.js renderProgress`; buttons: Download Standing PDF, Add Record; records table with code/title/units/SY/sem/status badge/grade/detail/provenance + Edit/Remove action buttons), `downloadStanding` (blob fetch with `window._authToken` to `/api/admin/students/:id/standing`, filename from Content-Disposition — pattern of `units.js downloadStanding`). All dynamic strings pass `esc()`.

- [ ] **Step 2: Gates + commit** — `node --check client/js/admin-units.js` then `git add client/js/admin-units.js && git commit -m "feat(admin): student records search and workspace view"`

---

### Task 9: `admin-units.js` — record modal + mutations

**Files:**
- Modify: `client/js/admin-units.js` (append modal logic)

**Interfaces:**
- Consumes: workspace state from Task 8; modal DOM ids from Task 7 Step 4.
- Produces: `openRecordModal(mode, record)` ('add' | 'edit'), `saveRecordModal()` (validates reason ≥ 5, SY regex, grade 1–5 client-side; POST or PATCH; toast; re-fetch records), `removeRecord(id)` (prompt-based reason via `window.prompt('Reason for removing this record (min. 5 characters):')`, DELETE with body `{reason}`), wired into the workspace delegated clicks and modal save/cancel/overlay-close (reuse the `modal-closing` animation pattern from `units.js`).

- [ ] **Step 1: Implement + wire** (subject select populated from `_subjects` filtered to the student's program, excluding archived; prefill on edit from the record).
- [ ] **Step 2: Gates + commit** — `node --check client/js/admin-units.js` then `git commit -m "feat(admin): reason-gated record add/edit/remove modal"`

---

### Task 10: `admin-units.js` — Curriculum Manager

**Files:**
- Modify: `client/js/admin-units.js` (append curriculum logic)

**Interfaces:**
- Consumes: `Api.admin.{adminSubjects, createSubject, updateSubject, updateCurriculum}`; DOM from Task 7 Steps 3–4.
- Produces: `loadCurriculum(program)` (fetch + render table + prefill `#au-cur-total`), subject table rows with Edit / Archive|Unarchive buttons (delegated `data-au="subj-edit|subj-archive"`), `openSubjectModal(subject|null)`, `saveSubjectModal()` (client validation mirrors Task 6 rules; confirm-dialog warning when editing `units` of a subject with `record_count > 0`), `saveTotalUnits()` (prompt reason → PATCH curriculum).

- [ ] **Step 1: Implement** — table columns: Code, Title, Units, Year, Sem, Prereqs, Elective, Records (count), Status (Archived badge via `unit-badge unit-badge--none`), Actions.
- [ ] **Step 2: Gates + commit** — `node --check client/js/admin-units.js` then `git commit -m "feat(admin): curriculum manager with archive and total units"`

---

### Task 11: Final gates + QA handoff

- [ ] **Step 1: All gates** — `node --check` on every touched file; `node scripts/smoke-test-units-fields.js`; `node scripts/smoke-test-standing.js` (then delete the emitted PDF).
- [ ] **Step 2: Manual QA checklist** (requires migration 008 applied in Supabase + admin login): search student → open workspace; add/edit/remove record with reason → row appears in Audit Log (`ADMIN_*` actions with icons falling back to generic); short reason rejected; archive a subject → student checklist hides it, workspace/PDF keep it; un-archive restores; edit subject units with records → confirmation warning appears; change total units → student progress % recomputes; admin Standing PDF downloads with the student's name; mobile width tables scroll horizontally; non-admin API call returns 403.
- [ ] **Step 3: Commit + push** — `git add -A && git commit -m "chore(admin): academic management QA gates" && git push origin main`

---

## Self-Review Notes

- Spec coverage: migration (T1), PDF shared lib (T2), stamping (T3), search/read/PDF (T4), record mutations + reason + audit (T5), subjects/curriculum/archive/checklist filter (T6), API + markup + wiring (T7), student records UI (T8), record modal (T9), curriculum UI (T10), QA (T11). All eight audit actions emitted in T4–T6. Non-goals untouched.
- Type consistency: `buildStandingPDF({fullName, email, enrolledYear, createdAt, studentProgram, subjects, records, total, res})` identical in T2/T4; `Api.admin.*` names match T7/T8–T10 usage; validators defined once in T4 header and reused in T5/T6.
- Risk noted inline: PostgREST embedded joins in T5 pre-fetches depend on FK relationships; fallback documented in the task and covered by QA.
