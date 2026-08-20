// =============================================
// server/routes/units.js — Credit Unit Tracker API
// Students manage their own subject enrollment records.
// All ownership checks run against req.user.id (the verified
// Supabase JWT), never against client-supplied IDs.
// =============================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const PDFDocument = require('pdfkit');
const { isValidEnum, isValidUUID, assertRequired } = require('../lib/validate');
const { logError } = require('../lib/logger');

const VALID_PROGRAMS = ['BSCoE', 'BSCE', 'BSECE'];
const VALID_STATUSES = ['enrolled', 'passed', 'failed', 'dropped', 'incomplete'];
const SCHOOL_YEAR_RE = /^\d{4}-\d{4}$/;

const PROGRAM_NAMES = {
  BSCoE: 'BS Computer Engineering',
  BSCE:  'BS Civil Engineering',
  BSECE: 'BS Electronics Engineering',
};
const STATUS_LABELS = {
  enrolled:   'Enrolled',
  passed:     'Passed',
  failed:     'Failed',
  dropped:    'Dropped',
  incomplete: 'Incomplete',
};
const SEM_LABELS = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer Term' };

function isValidGrade(val) {
  if (val === null || val === undefined || val === '') return true;
  const n = Number(val);
  return Number.isFinite(n) && n >= 1 && n <= 5;
}

function isMissingRelation(err) {
  return /relation .* does not exist/i.test(err?.message || '');
}

// GET /api/units/checklists?program=BSCoE
// Curriculum requirements + subjects (optionally filtered by program).
router.get('/checklists', async (req, res) => {
  try {
    const program = req.query.program || null;
    if (program && !isValidEnum(program, VALID_PROGRAMS)) {
      return res.status(400).json({ error: 'Invalid program.' });
    }

    const reqQuery = supabase.from('curriculum_requirements').select('*');
    let subjQuery = supabase
      .from('subjects')
      .select('*')
      .order('year_level', { ascending: true })
      .order('semester',   { ascending: true })
      .order('code',       { ascending: true });
    if (program) subjQuery = subjQuery.eq('program', program);

    const [reqRes, subjRes] = await Promise.all([reqQuery, subjQuery]);
    if (reqRes.error || subjRes.error) {
      if (isMissingRelation(reqRes.error || subjRes.error)) {
        return res.status(503).json({ error: 'The credit unit tracker is not set up yet. Please run the 005_credit_unit_tracker.sql migration in the Supabase SQL console.' });
      }
      logError('units/checklists', reqRes.error || subjRes.error);
      return res.status(500).json({ error: 'Failed to load the curriculum.' });
    }

    res.json({ requirements: reqRes.data, subjects: subjRes.data });
  } catch (err) {
    logError('units/checklists', err);
    res.status(500).json({ error: 'Failed to load the curriculum.' });
  }
});

// GET /api/units/my
// The logged-in student's enrollment records, joined with subject details.
router.get('/my', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('student_units')
      .select('id, school_year, semester, grade, status, created_at, subjects(id, code, title, units, program, year_level, semester)')
      .eq('student_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingRelation(error)) {
        return res.status(503).json({ error: 'The credit unit tracker is not set up yet. Please run the 005_credit_unit_tracker.sql migration in the Supabase SQL console.' });
      }
      logError('units/my', error);
      return res.status(500).json({ error: 'Failed to load your units.' });
    }

    res.json(data);
  } catch (err) {
    logError('units/my', err);
    res.status(500).json({ error: 'Failed to load your units.' });
  }
});

// GET /api/units/standing
// PDF transcript of the student's academic standing — every subject from
// Year 1 to 4 with units, status, grade, and school year. Text-based, so it
// can be handed to an AI for analysis (a plain-text dump is appended).
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

    const subjects = subjRes.data || [];
    const records  = myRes.data || [];
    const total    = Number(reqRes.data?.total_units) || 0;

    // Summary — a passed subject counts once (mirrors the tracker's progress)
    const passedIds = new Set(records.filter(r => r.status === 'passed').map(r => r.subject_id));
    const completed = subjects
      .filter(s => passedIds.has(s.id))
      .reduce((sum, s) => sum + Number(s.units || 0), 0);
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

    // Newest record per subject wins (API stores newest first)
    const recordBySubject = new Map();
    records.forEach(r => {
      if (!recordBySubject.has(r.subject_id)) recordBySubject.set(r.subject_id, r);
    });

    const enrolledYear = Number(req.profile?.enrollment_year) || null;
    const created = req.profile?.created_at ? new Date(req.profile.created_at) : null;
    const gradYear = enrolledYear
      ? enrolledYear + 4
      : (created && !isNaN(created) ? created.getFullYear() + 4 : new Date().getFullYear() + 4);

    const fullName = req.profile?.full_name || req.user.email || 'Student';

    // ── Build PDF ──
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="Academic-Standing-${fullName.replace(/[^a-zA-Z0-9]+/g, '-')}-${studentProgram}.pdf"`);
    doc.pipe(res);

    const primary   = '#1a1f35';
    const accent    = '#F97316'; /* engineering orange */
    const textMuted = '#64748b';
    const pageWidth = doc.page.width - 100;

    // Header band
    doc.rect(0, 0, doc.page.width, 90).fill(primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
       .text('COE Academic Standing', 50, 22);
    doc.font('Helvetica').fontSize(10).fillColor('#a5b4fc')
       .text('College of Engineering — Cor Jesu College', 50, 46);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
       .text('SUBJECT STATUS REPORT — YEAR 1 TO 4', 50, 64);

    doc.moveDown(3.2);

    // Student info card
    const infoY = doc.y;
    doc.roundedRect(50, infoY, pageWidth, 96, 8).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(14)
       .text(fullName, 66, infoY + 14, { width: pageWidth - 32 });
    doc.font('Helvetica').fontSize(9.5).fillColor(textMuted);
    doc.text(`Program: ${PROGRAM_NAMES[studentProgram] || studentProgram} (${studentProgram})`, 66, infoY + 36);
    doc.text(`Email: ${req.user.email}`, 66, infoY + 52);
    doc.text(`Enrollment Year: ${enrolledYear || '—'}`, 66, infoY + 68);
    doc.text(`Estimated Graduation: ${gradYear}`, 300, infoY + 68);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 66, infoY + 84);

    doc.moveDown(5);

    // Summary stat boxes
    const boxes = [
      { label: 'Units Completed', value: String(completed) },
      { label: 'Required Units',  value: String(total || '—') },
      { label: 'Progress',        value: `${pct}%` },
      { label: 'Subjects Taken',  value: String(recordBySubject.size) },
    ];
    const boxW = (pageWidth - 30) / 4;
    const boxY = doc.y;
    boxes.forEach((b, i) => {
      const x = 50 + i * (boxW + 10);
      doc.roundedRect(x, boxY, boxW, 52, 6).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor(accent).font('Helvetica-Bold').fontSize(15)
         .text(b.value, x + 12, boxY + 10, { width: boxW - 24, align: 'center' });
      doc.fillColor(textMuted).font('Helvetica').fontSize(7.5)
         .text(b.label.toUpperCase(), x + 12, boxY + 34, { width: boxW - 24, align: 'center' });
    });
    doc.moveDown(7);

    // Subject table
    const cols = { code: 50, title: 118, sem: 268, sy: 330, units: 405, status: 452, grade: 508 };
    function tableHeader() {
      const y = doc.y;
      doc.rect(50, y, pageWidth, 22).fill(primary);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      doc.text('CODE',        cols.code,  y + 7, { width: 60 });
      doc.text('SUBJECT',     cols.title, y + 7, { width: 145 });
      doc.text('SEM',         cols.sem,   y + 7, { width: 60 });
      doc.text('SCHOOL YEAR', cols.sy,    y + 7, { width: 70 });
      doc.text('UNITS',       cols.units, y + 7, { width: 42, align: 'right' });
      doc.text('STATUS',      cols.status,y + 7, { width: 55 });
      doc.text('GRADE',       cols.grade, y + 7, { width: 42, align: 'right' });
      return y + 22;
    }

    const statusColors = {
      passed:     '#10b981',
      enrolled:   '#f97316',
      failed:     '#ef4444',
      incomplete: '#f59e0b',
      dropped:    '#64748b',
      'not taken': '#94a3b8',
    };

    let rowY = tableHeader();
    let band = 0;
    const years = [1, 2, 3, 4].filter(y => subjects.some(s => s.year_level === y));

    years.forEach(year => {
      // Year banner
      if (rowY > doc.page.height - 130) { doc.addPage(); rowY = tableHeader(); }
      doc.rect(50, rowY, pageWidth, 20).fill('#f97316');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(`YEAR ${year}`, 56, rowY + 6);
      rowY += 20;

      subjects.filter(s => s.year_level === year).forEach(s => {
        if (rowY > doc.page.height - 90) { doc.addPage(); rowY = tableHeader(); }
        const rec = recordBySubject.get(s.id);
        const status = rec?.status || 'not taken';
        const bg = band % 2 === 0 ? '#ffffff' : '#f8fafc';
        const rowH = 20;
        doc.rect(50, rowY, pageWidth, rowH).fill(bg);

        doc.fillColor(textMuted).font('Helvetica').fontSize(8.5);
        doc.text(s.code, cols.code,  rowY + 6, { width: 60 });
        doc.fillColor('#0f172a').font('Helvetica').fontSize(8.5)
           .text(s.title, cols.title, rowY + 6, { width: 145 });
        doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
           .text(SEM_LABELS[rec?.semester ?? s.semester] || '—', cols.sem, rowY + 6, { width: 60 });
        doc.text(rec?.school_year || '—', cols.sy, rowY + 6, { width: 70 });
        doc.text(String(s.units), cols.units, rowY + 6, { width: 42, align: 'right' });
        doc.fillColor(statusColors[status] || textMuted).font('Helvetica-Bold').fontSize(8.5)
           .text((STATUS_LABELS[status] || status).toUpperCase(), cols.status, rowY + 6, { width: 55 });
        doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
           .text(rec?.grade != null ? String(rec.grade) : '—', cols.grade, rowY + 6, { width: 42, align: 'right' });

        rowY += rowH;
        band++;
      });
    });

    // ── Machine-readable appendix (for AI / data analysis) ──
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 60).fill(primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text('MACHINE-READABLE DATA', 50, 20);
    doc.font('Helvetica').fontSize(9).fillColor('#a5b4fc')
       .text('Plain-text record for AI analysis / data processing', 50, 42);

    doc.moveDown(2.5);
    doc.font('Courier').fontSize(8).fillColor('#0f172a');
    doc.text(`STUDENT|${fullName}|${studentProgram}|${PROGRAM_NAMES[studentProgram] || ''}|${enrolledYear || ''}|${gradYear}|${req.user.email}`);
    doc.text(`SUMMARY|required_units=${total}|completed_units=${completed}|progress_pct=${pct}|subjects_taken=${recordBySubject.size}|subjects_passed=${passedIds.size}`);
    doc.text('FIELDS|code|title|units|year_level|semester|school_year|status|grade');
    doc.text('SUBJECTS');
    subjects.forEach(s => {
      const rec = recordBySubject.get(s.id);
      doc.text(`${s.code}|${s.title}|${s.units}|${s.year_level}|${s.semester}|${rec?.school_year || ''}|${rec?.status || 'not_taken'}|${rec?.grade ?? ''}`);
    });
    doc.text('END');

    doc.end();
  } catch (err) {
    logError('units/standing', err);
    res.status(500).json({ error: 'Failed to generate the standing report.' });
  }
});

// POST /api/units/enroll
// Log a subject for the current student.
router.post('/enroll', async (req, res) => {
  try {
    const { subject_id, school_year, semester, status = 'enrolled', grade = null } = req.body || {};

    const missing = assertRequired({ subject_id, school_year, semester });
    if (missing) return res.status(400).json({ error: missing });
    if (!isValidUUID(subject_id))                return res.status(400).json({ error: 'Invalid subject id.' });
    if (!SCHOOL_YEAR_RE.test(school_year))       return res.status(400).json({ error: 'School year must look like "2026-2027".' });
    if (![1, 2, 3].includes(Number(semester)))   return res.status(400).json({ error: 'Semester must be 1, 2, or 3 (summer).' });
    if (!isValidEnum(status, VALID_STATUSES))    return res.status(400).json({ error: 'Invalid status.' });
    if (!isValidGrade(grade))                    return res.status(400).json({ error: 'Grade must be between 1.0 and 5.0.' });

    // Subject must exist and belong to the student's enrolled program —
    // students can only log subjects from their own course.
    const { data: subject, error: subjErr } = await supabase
      .from('subjects')
      .select('id, program')
      .eq('id', subject_id)
      .single();
    if (subjErr || !subject) return res.status(404).json({ error: 'Subject not found.' });

    // Students can only log subjects from their own course. Match
    // case/whitespace-insensitively so profiles storing " bscoe " or
    // "BSCOE" still resolve to the canonical program code.
    const studentProgram = VALID_PROGRAMS.find(
      p => p.toUpperCase() === String(req.profile?.course || '').trim().toUpperCase()
    );
    if (!studentProgram || subject.program !== studentProgram) {
      return res.status(403).json({ error: 'You can only log subjects from your enrolled program.' });
    }

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

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'This subject is already logged for that school year and semester.' });
      }
      logError('units/enroll', error);
      return res.status(500).json({ error: 'Failed to log the subject.' });
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    logError('units/enroll', err);
    res.status(500).json({ error: 'Failed to log the subject.' });
  }
});

// PATCH /api/units/update/:id
// Update status / grade / school year / semester of one of the student's records.
router.patch('/update/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid record id.' });

    const { data: existing, error: fetchErr } = await supabase
      .from('student_units')
      .select('id')
      .eq('id', id)
      .eq('student_id', req.user.id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Record not found.' });

    const { status, grade, school_year, semester } = req.body || {};
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
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const { error } = await supabase
      .from('student_units')
      .update(updates)
      .eq('id', id)
      .eq('student_id', req.user.id);

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Another record already exists for that school year and semester.' });
      }
      logError('units/update', error);
      return res.status(500).json({ error: 'Failed to update the record.' });
    }

    res.json({ ok: true });
  } catch (err) {
    logError('units/update', err);
    res.status(500).json({ error: 'Failed to update the record.' });
  }
});

// DELETE /api/units/drop/:id
// Remove one of the student's records (e.g. dropped subject).
router.delete('/drop/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid record id.' });

    const { data: existing, error: fetchErr } = await supabase
      .from('student_units')
      .select('id')
      .eq('id', id)
      .eq('student_id', req.user.id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Record not found.' });

    const { error } = await supabase
      .from('student_units')
      .delete()
      .eq('id', id)
      .eq('student_id', req.user.id);

    if (error) {
      logError('units/drop', error);
      return res.status(500).json({ error: 'Failed to remove the record.' });
    }

    res.json({ ok: true });
  } catch (err) {
    logError('units/drop', err);
    res.status(500).json({ error: 'Failed to remove the record.' });
  }
});

module.exports = router;
