// =============================================
// server/routes/units.js — Credit Unit Tracker API
// Students manage their own subject enrollment records.
// All ownership checks run against req.user.id (the verified
// Supabase JWT), never against client-supplied IDs.
// =============================================
const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
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
const SEM_SHORT  = { 1: '1st Sem', 2: '2nd Sem', 3: 'Summer' };

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
    // Institutional letterhead style: light pages, dark text, a single thin
    // engineering-orange rule as the only accent. No heavy dark bands.
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="Academic-Standing-${fullName.replace(/[^a-zA-Z0-9]+/g, '-')}-${studentProgram}.pdf"`);
    doc.pipe(res);

    const primary   = '#1a1f35';  /* ink */
    const accent    = '#F97316';  /* engineering orange — sole accent */
    const textMuted = '#64748b';
    const faint     = '#e2e8f0';  /* hairlines / track */
    const veryLight = '#f8fafc';  /* alternating row fill */
    const pageWidth = doc.page.width - 100; /* 495 */

    const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // ── Letterhead ──
    const logoPath = path.join(__dirname, '../../client/assets/coe-logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 38, { width: 72, height: 72 });
    }
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(19)
       .text('COLLEGE OF ENGINEERING', 138, 42, { width: pageWidth - 88 });
    doc.font('Helvetica').fontSize(11).fillColor(textMuted)
       .text('Cor Jesu College', 138, 68);
    doc.rect(50, 116, pageWidth, 3).fill(accent); // thin orange rule
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(14)
       .text('OFFICIAL ACADEMIC STANDING REPORT', 50, 134);
    doc.font('Helvetica').fontSize(9.5).fillColor(textMuted)
       .text('Subject Status Report — Year 1 to 4', 50, 155);
    doc.moveDown(3);

    // ── Student information — two-column metadata block ──
    const metaTop = doc.y;
    const metaH   = 12 + 4 * 16 + 10;
    doc.rect(50, metaTop, pageWidth, metaH).fillAndStroke(veryLight, faint);
    const leftMeta = [
      ['Name',            fullName],
      ['Email',           req.user.email],
      ['Enrollment Year', enrolledYear || '—'],
      ['Generated',       generated],
    ];
    const rightMeta = [
      ['Program',              PROGRAM_NAMES[studentProgram] || studentProgram],
      ['Estimated Graduation', String(gradYear)],
    ];
    leftMeta.forEach(([label, value], i) => {
      const y = metaTop + 12 + i * 16;
      doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8)
         .text(label, 62, y);
      doc.fillColor(primary).font('Helvetica').fontSize(9)
         .text(value, 150, y, { width: 140 });
    });
    rightMeta.forEach(([label, value], i) => {
      const y = metaTop + 12 + i * 16;
      doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8)
         .text(label, 300, y);
      doc.fillColor(primary).font('Helvetica').fontSize(9)
         .text(value, 410, y, { width: 130 });
    });
    doc.moveDown(6);

    // ── Progress summary — vector bar (PDFKit has no text glyphs for block
    //    characters in its built-in fonts, so the bar is drawn with shapes) ──
    doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8.5)
       .text('PROGRESS', 50, doc.y);
    const trackTop = doc.y + 4;
    doc.roundedRect(50, trackTop, pageWidth, 12, 6).fill(faint);
    const fillW = total > 0 ? Math.max(12, (pageWidth * pct) / 100) : 0;
    if (fillW > 0) doc.roundedRect(50, trackTop, fillW, 12, 6).fill(accent);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(9.5)
       .text(`${pct}% complete (${completed} / ${total || '—'} units completed)`, 50, trackTop + 18, { width: pageWidth });
    doc.moveDown(5);

    // ── Subject table ──
    const cols = { code: 50, title: 108, units: 292, sy: 328, sem: 392, status: 446, grade: 512 };
    const colW = { code: 56, title: 182, units: 34, sy: 62, sem: 52, status: 64, grade: 33 };

    function tableHeader() {
      const y = doc.y;
      doc.rect(50, y, pageWidth, 20).fill(veryLight);
      doc.fillColor(primary).font('Helvetica-Bold').fontSize(7.5);
      doc.text('CODE',         cols.code,  y + 7, { width: colW.code });
      doc.text('SUBJECT TITLE', cols.title, y + 7, { width: colW.title });
      doc.text('UNITS',        cols.units, y + 7, { width: colW.units, align: 'right' });
      doc.text('SCHOOL YEAR',  cols.sy,    y + 7, { width: colW.sy });
      doc.text('SEM',          cols.sem,   y + 7, { width: colW.sem });
      doc.text('STATUS',       cols.status,y + 7, { width: colW.status });
      doc.text('GRADE',        cols.grade, y + 7, { width: colW.grade, align: 'right' });
      doc.rect(50, y + 20, pageWidth, 1).fill(faint); // hairline under the header
      return y + 21;
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
      // Year banner — light band with a 3px orange left bar, no heavy fill
      if (rowY > doc.page.height - 130) { doc.addPage(); rowY = tableHeader(); }
      doc.rect(50, rowY, pageWidth, 20).fill(veryLight);
      doc.rect(50, rowY, 3, 20).fill(accent);
      doc.fillColor(primary).font('Helvetica-Bold').fontSize(10).text(`YEAR ${year}`, 60, rowY + 5);
      rowY += 20;

      [1, 2, 3].filter(sem => subjects.some(s => s.year_level === year && s.semester === sem))
        .forEach(sem => {
          // Semester sub-header — italic gray
          if (rowY > doc.page.height - 90) { doc.addPage(); rowY = tableHeader(); }
          doc.fillColor(textMuted).font('Helvetica-Oblique').fontSize(8.5)
             .text(`${SEM_LABELS[sem] || 'Semester ' + sem}`, 60, rowY + 2);
          rowY += 15;

          subjects.filter(s => s.year_level === year && s.semester === sem).forEach(s => {
            const rec = recordBySubject.get(s.id);
            const status = rec?.status || 'not taken';
            const titleH = doc.heightOfString(s.title, { width: colW.title });
            const rowH = Math.max(20, titleH + 10);
            if (rowY + rowH > doc.page.height - 60) { doc.addPage(); rowY = tableHeader(); }

            const bg = band % 2 === 0 ? '#ffffff' : veryLight;
            doc.rect(50, rowY, pageWidth, rowH).fill(bg);
            doc.rect(50, rowY + rowH - 0.5, pageWidth, 0.5).fill(faint); // hairline row border

            doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
               .text(s.code, cols.code, rowY + 6, { width: colW.code });
            doc.fillColor(primary).font('Helvetica').fontSize(8.5)
               .text(s.title, cols.title, rowY + 6, { width: colW.title, height: rowH - 8 });
            doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
               .text(String(s.units), cols.units, rowY + 6, { width: colW.units, align: 'right' });
            doc.text(rec?.school_year || '—', cols.sy, rowY + 6, { width: colW.sy });
            doc.text(SEM_SHORT[rec?.semester ?? s.semester] || '—', cols.sem, rowY + 6, { width: colW.sem });
            doc.fillColor(statusColors[status] || textMuted).font('Helvetica-Bold').fontSize(8)
               .text((STATUS_LABELS[status] || status).toUpperCase(), cols.status, rowY + 6, { width: colW.status });
            doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
               .text(rec?.grade != null ? String(rec.grade) : '—', cols.grade, rowY + 6, { width: colW.grade, align: 'right' });

            rowY += rowH;
            band++;
          });
        });
    });

    // ── Appendix — machine-readable dump, clearly a separate section ──
    doc.addPage();
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(13).text('APPENDIX A — MACHINE-READABLE DATA', 50, 50);
    doc.rect(50, 62, 60, 2).fill(accent);
    doc.font('Helvetica').fontSize(9).fillColor(textMuted)
       .text('Plain-text transcript for AI analysis / data processing — auxiliary, not part of the official record.', 50, 74, { width: pageWidth });

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

    // ── Final page — summary + signature block ──
    doc.addPage();
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(13).text('SUMMARY', 50, 50);
    doc.rect(50, 62, 60, 2).fill(accent);

    const sumY = 78;
    doc.fillColor(textMuted).font('Helvetica').fontSize(9.5)
       .text('Subjects Passed:', 50, sumY);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(10.5)
       .text(String(passedIds.size), 150, sumY);
    doc.fillColor(textMuted).font('Helvetica').fontSize(9.5)
       .text('Units Completed:', 50, sumY + 20);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(10.5)
       .text(`${completed} / ${total || '—'}`, 150, sumY + 20);
    doc.fillColor(textMuted).font('Helvetica').fontSize(9.5)
       .text('Progress:', 300, sumY);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(10.5)
       .text(`${pct}%`, 380, sumY);
    doc.fillColor(textMuted).font('Helvetica').fontSize(9.5)
       .text('Est. Graduation:', 300, sumY + 20);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(10.5)
       .text(String(gradYear), 380, sumY + 20);

    // Signature block
    const sigY = sumY + 70;
    doc.moveTo(50, sigY).lineTo(230, sigY).lineWidth(1).strokeColor(faint).stroke();
    doc.moveTo(300, sigY).lineTo(480, sigY).lineWidth(1).strokeColor(faint).stroke();
    doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
       .text('Student Signature', 50, sigY + 6);
    doc.text('Date', 300, sigY + 6);
    doc.moveDown(3);
    doc.fillColor(textMuted).font('Helvetica-Oblique').fontSize(8)
       .text('This document is system-generated and unofficial unless bearing the Office of the Registrar\'s seal.', 50, doc.y + 6, { width: pageWidth });

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
