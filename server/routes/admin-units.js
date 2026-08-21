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
      .select('id, student_id, subjects(code)')
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

module.exports = router;
