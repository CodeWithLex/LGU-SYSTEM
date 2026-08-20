// =============================================
// seed-subjects.js — Seed the Credit Unit Tracker curriculum
// Fallback for environments where the SQL migration
// (supabase/migrations/005_credit_unit_tracker.sql) cannot be
// applied through the SQL console. Idempotent — safe to re-run.
//
// Usage: node seed-subjects.js
// Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in .env
// =============================================
require('dotenv').config();
const supabase = require('./server/lib/supabase');

// Totals must stay in sync with supabase/migrations/005_credit_unit_tracker.sql
const REQUIREMENTS = [
  { program: 'BSCoE', total_units: 124, total_subjects: 43 },
  { program: 'BSCE',  total_units: 129, total_subjects: 44 },
  { program: 'BSECE', total_units: 127, total_subjects: 43 },
];

// [code, title, units, program, year_level, semester]
const SUBJECTS = [
  // ---- BSCoE ----
  ['MATH111', 'Calculus 1', 3, 'BSCoE', 1, 1],
  ['CHEM111', 'Chemistry for Engineers', 3, 'BSCoE', 1, 1],
  ['ENGG111', 'Introduction to Engineering', 2, 'BSCoE', 1, 1],
  ['COE111', 'Computer Engineering as a Discipline', 1, 'BSCoE', 1, 1],
  ['NSTP1', 'National Service Training Program 1', 3, 'BSCoE', 1, 1],
  ['GE111', 'Understanding the Self', 3, 'BSCoE', 1, 1],
  ['MATH112', 'Calculus 2', 3, 'BSCoE', 1, 2],
  ['PHYS111', 'Physics for Engineers 1', 4, 'BSCoE', 1, 2],
  ['COE112', 'Programming Logic and Design', 3, 'BSCoE', 1, 2],
  ['NSTP2', 'National Service Training Program 2', 3, 'BSCoE', 1, 2],
  ['GE112', 'Readings in Philippine History', 3, 'BSCoE', 1, 2],
  ['MATH211', 'Differential Equations', 3, 'BSCoE', 2, 1],
  ['PHYS112', 'Physics for Engineers 2', 4, 'BSCoE', 2, 1],
  ['COE211', 'Object-Oriented Programming', 3, 'BSCoE', 2, 1],
  ['COE212', 'Discrete Mathematics', 3, 'BSCoE', 2, 1],
  ['GE113', 'The Contemporary World', 3, 'BSCoE', 2, 1],
  ['MATH212', 'Advanced Mathematics for COE', 3, 'BSCoE', 2, 2],
  ['COE221', 'Data Structures and Algorithms', 3, 'BSCoE', 2, 2],
  ['COE222', 'Software Design', 3, 'BSCoE', 2, 2],
  ['COE223', 'Circuits 1', 4, 'BSCoE', 2, 2],
  ['GE114', 'Purposive Communication', 3, 'BSCoE', 2, 2],
  ['COE311', 'Operating Systems', 3, 'BSCoE', 3, 1],
  ['COE312', 'Computer Architecture', 3, 'BSCoE', 3, 1],
  ['COE313', 'Digital Systems Design', 3, 'BSCoE', 3, 1],
  ['MATH311', 'Numerical Methods', 3, 'BSCoE', 3, 1],
  ['GE311', 'Ethics', 3, 'BSCoE', 3, 1],
  ['PE101', 'Physical Education 1', 2, 'BSCoE', 3, 1],
  ['COE321', 'Database Systems', 3, 'BSCoE', 3, 2],
  ['COE322', 'Computer Networks', 3, 'BSCoE', 3, 2],
  ['COE323', 'Microprocessor Systems', 3, 'BSCoE', 3, 2],
  ['COE324', 'Software Engineering', 3, 'BSCoE', 3, 2],
  ['GE312', 'Science, Technology and Society', 3, 'BSCoE', 3, 2],
  ['PE102', 'Physical Education 2', 2, 'BSCoE', 3, 2],
  ['COE411', 'Artificial Intelligence', 3, 'BSCoE', 4, 1],
  ['COE412', 'Systems Integration and Architecture', 3, 'BSCoE', 4, 1],
  ['COE413', 'Capstone Project 1', 3, 'BSCoE', 4, 1],
  ['GE313', 'Life and Works of Rizal', 3, 'BSCoE', 4, 1],
  ['PE103', 'Physical Education 3', 2, 'BSCoE', 4, 1],
  ['COE421', 'Capstone Project 2', 3, 'BSCoE', 4, 2],
  ['COE422', 'Embedded Systems Design', 3, 'BSCoE', 4, 2],
  ['COE423', 'Seminars and Comprehensive Review', 1, 'BSCoE', 4, 2],
  ['GE314', 'Art Appreciation', 3, 'BSCoE', 4, 2],
  ['COE424', 'Practicum / On-the-Job Training', 3, 'BSCoE', 4, 2],

  // ---- BSCE ----
  ['MATH111', 'Calculus 1', 3, 'BSCE', 1, 1],
  ['CHEM111', 'Chemistry for Engineers', 3, 'BSCE', 1, 1],
  ['ENGG111', 'Introduction to Engineering', 2, 'BSCE', 1, 1],
  ['CE111', 'Civil Engineering Orientation', 1, 'BSCE', 1, 1],
  ['NSTP1', 'National Service Training Program 1', 3, 'BSCE', 1, 1],
  ['GE111', 'Understanding the Self', 3, 'BSCE', 1, 1],
  ['MATH112', 'Calculus 2', 3, 'BSCE', 1, 2],
  ['PHYS111', 'Physics for Engineers 1', 4, 'BSCE', 1, 2],
  ['CE112', 'Geotechnical Engineering 1', 3, 'BSCE', 1, 2],
  ['NSTP2', 'National Service Training Program 2', 3, 'BSCE', 1, 2],
  ['GE112', 'Readings in Philippine History', 3, 'BSCE', 1, 2],
  ['MATH211', 'Differential Equations', 3, 'BSCE', 2, 1],
  ['PHYS112', 'Physics for Engineers 2', 4, 'BSCE', 2, 1],
  ['CE211', 'Engineering Mechanics 1', 3, 'BSCE', 2, 1],
  ['CE212', 'Surveying 1', 4, 'BSCE', 2, 1],
  ['GE113', 'The Contemporary World', 3, 'BSCE', 2, 1],
  ['CE221', 'Engineering Mechanics 2', 3, 'BSCE', 2, 2],
  ['CE222', 'Strength of Materials', 4, 'BSCE', 2, 2],
  ['CE223', 'Construction Materials and Methods', 3, 'BSCE', 2, 2],
  ['MATH221', 'Engineering Data Analysis', 3, 'BSCE', 2, 2],
  ['GE114', 'Purposive Communication', 3, 'BSCE', 2, 2],
  ['CE311', 'Structural Theory 1', 4, 'BSCE', 3, 1],
  ['CE312', 'Fluid Mechanics', 3, 'BSCE', 3, 1],
  ['CE313', 'Hydrology', 3, 'BSCE', 3, 1],
  ['CE314', 'Engineering Economics', 3, 'BSCE', 3, 1],
  ['GE311', 'Ethics', 3, 'BSCE', 3, 1],
  ['PE101', 'Physical Education 1', 2, 'BSCE', 3, 1],
  ['CE321', 'Structural Theory 2', 4, 'BSCE', 3, 2],
  ['CE322', 'Geotechnical Engineering 2', 3, 'BSCE', 3, 2],
  ['CE323', 'Transportation Engineering', 3, 'BSCE', 3, 2],
  ['CE324', 'Steel Design', 3, 'BSCE', 3, 2],
  ['CE325', 'Reinforced Concrete Design', 3, 'BSCE', 3, 2],
  ['PE102', 'Physical Education 2', 2, 'BSCE', 3, 2],
  ['CE411', 'Construction Methods and Project Management', 3, 'BSCE', 4, 1],
  ['CE412', 'Water and Wastewater Engineering', 3, 'BSCE', 4, 1],
  ['CE413', 'CE Capstone Project 1', 3, 'BSCE', 4, 1],
  ['CE414', 'Foundation Design', 3, 'BSCE', 4, 1],
  ['GE313', 'Life and Works of Rizal', 3, 'BSCE', 4, 1],
  ['PE103', 'Physical Education 3', 2, 'BSCE', 4, 1],
  ['CE421', 'CE Capstone Project 2', 3, 'BSCE', 4, 2],
  ['CE422', 'Professional Practice / OJT', 3, 'BSCE', 4, 2],
  ['CE423', 'CE Seminars', 1, 'BSCE', 4, 2],
  ['GE314', 'Art Appreciation', 3, 'BSCE', 4, 2],
  ['CE424', 'CE Laws and Contracts', 2, 'BSCE', 4, 2],

  // ---- BSECE ----
  ['MATH111', 'Calculus 1', 3, 'BSECE', 1, 1],
  ['CHEM111', 'Chemistry for Engineers', 3, 'BSECE', 1, 1],
  ['ENGG111', 'Introduction to Engineering', 2, 'BSECE', 1, 1],
  ['ECE111', 'ECE Orientation', 1, 'BSECE', 1, 1],
  ['NSTP1', 'National Service Training Program 1', 3, 'BSECE', 1, 1],
  ['GE111', 'Understanding the Self', 3, 'BSECE', 1, 1],
  ['MATH112', 'Calculus 2', 3, 'BSECE', 1, 2],
  ['PHYS111', 'Physics for Engineers 1', 4, 'BSECE', 1, 2],
  ['ECE112', 'Programming Logic and Design', 3, 'BSECE', 1, 2],
  ['NSTP2', 'National Service Training Program 2', 3, 'BSECE', 1, 2],
  ['GE112', 'Readings in Philippine History', 3, 'BSECE', 1, 2],
  ['MATH211', 'Differential Equations', 3, 'BSECE', 2, 1],
  ['PHYS112', 'Physics for Engineers 2', 4, 'BSECE', 2, 1],
  ['ECE211', 'Circuits 1', 4, 'BSECE', 2, 1],
  ['ECE212', 'Electromagnetics 1', 3, 'BSECE', 2, 1],
  ['GE113', 'The Contemporary World', 3, 'BSECE', 2, 1],
  ['ECE221', 'Circuits 2', 4, 'BSECE', 2, 2],
  ['ECE222', 'Electronic Devices and Circuits', 4, 'BSECE', 2, 2],
  ['MATH221', 'Engineering Data Analysis', 3, 'BSECE', 2, 2],
  ['GE114', 'Purposive Communication', 3, 'BSECE', 2, 2],
  ['ECE311', 'Signals, Spectra and Signal Processing', 3, 'BSECE', 3, 1],
  ['ECE312', 'Electronics 2', 4, 'BSECE', 3, 1],
  ['ECE313', 'Digital Electronics', 3, 'BSECE', 3, 1],
  ['ECE314', 'Communications 1', 3, 'BSECE', 3, 1],
  ['GE311', 'Ethics', 3, 'BSECE', 3, 1],
  ['PE101', 'Physical Education 1', 2, 'BSECE', 3, 1],
  ['ECE321', 'Communications 2', 3, 'BSECE', 3, 2],
  ['ECE322', 'Control Systems', 3, 'BSECE', 3, 2],
  ['ECE323', 'Electromagnetics 2', 3, 'BSECE', 3, 2],
  ['ECE324', 'Microprocessors and Microcontrollers', 4, 'BSECE', 3, 2],
  ['GE312', 'Science, Technology and Society', 3, 'BSECE', 3, 2],
  ['PE102', 'Physical Education 2', 2, 'BSECE', 3, 2],
  ['ECE411', 'Electronic Systems Design (Capstone 1)', 3, 'BSECE', 4, 1],
  ['ECE412', 'Digital Signal Processing', 3, 'BSECE', 4, 1],
  ['ECE413', 'Practicum / OJT 1', 3, 'BSECE', 4, 1],
  ['ECE414', 'Data Communications', 3, 'BSECE', 4, 1],
  ['GE313', 'Life and Works of Rizal', 3, 'BSECE', 4, 1],
  ['PE103', 'Physical Education 3', 2, 'BSECE', 4, 1],
  ['ECE421', 'ECE Capstone 2', 3, 'BSECE', 4, 2],
  ['ECE422', 'ECE Seminars', 1, 'BSECE', 4, 2],
  ['ECE423', 'Special Topics in ECE', 2, 'BSECE', 4, 2],
  ['GE314', 'Art Appreciation', 3, 'BSECE', 4, 2],
  ['ECE424', 'ECE Laws and Professional Ethics', 3, 'BSECE', 4, 2],
];

async function main() {
  console.log('[seed] Upserting curriculum requirements…');
  const { error: reqErr } = await supabase
    .from('curriculum_requirements')
    .upsert(REQUIREMENTS, { onConflict: 'program' });
  if (reqErr) throw reqErr;

  console.log(`[seed] Upserting ${SUBJECTS.length} subjects…`);
  const rows = SUBJECTS.map(([code, title, units, program, year_level, semester]) => ({
    code, title, units, program, year_level, semester,
  }));
  const { error: subjErr } = await supabase
    .from('subjects')
    .upsert(rows, { onConflict: 'program,code' });
  if (subjErr) throw subjErr;

  console.log('[seed] Done. Curriculum is ready for the Credit Unit Tracker.');
}

main().catch(err => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
