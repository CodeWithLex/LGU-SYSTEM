// =============================================
// server/routes/units.js — Credit Unit Tracker API
// Students manage their own subject enrollment records.
// All ownership checks run against req.user.id (the verified
// Supabase JWT), never against client-supplied IDs.
// =============================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { isValidEnum, isValidUUID, assertRequired } = require('../lib/validate');
const { logError } = require('../lib/logger');

const VALID_PROGRAMS = ['BSCoE', 'BSCE', 'BSECE'];
const VALID_STATUSES = ['enrolled', 'passed', 'failed', 'dropped', 'incomplete'];
const SCHOOL_YEAR_RE = /^\d{4}-\d{4}$/;

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

    // Subject must exist
    const { data: subject, error: subjErr } = await supabase
      .from('subjects')
      .select('id')
      .eq('id', subject_id)
      .single();
    if (subjErr || !subject) return res.status(404).json({ error: 'Subject not found.' });

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
