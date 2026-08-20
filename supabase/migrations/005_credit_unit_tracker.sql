-- =============================================
-- Migration: 005_credit_unit_tracker.sql
-- COE Credit Unit Tracker Schema & Policies
-- =============================================

-- 1. Create curriculum_requirements table
CREATE TABLE IF NOT EXISTS public.curriculum_requirements (
  program           TEXT PRIMARY KEY CHECK (program IN ('BSCoE', 'BSCE', 'BSECE')),
  total_units       SMALLINT NOT NULL,
  total_subjects    SMALLINT NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create subjects table
CREATE TABLE IF NOT EXISTS public.subjects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         TEXT NOT NULL,
  title        TEXT NOT NULL,
  units        SMALLINT NOT NULL,
  program      TEXT NOT NULL REFERENCES public.curriculum_requirements(program) ON DELETE CASCADE,
  year_level   SMALLINT NOT NULL CHECK (year_level BETWEEN 1 AND 4),
  semester     SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 2),
  is_elective  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (program, code)
);

-- 3. Create student_units table
CREATE TABLE IF NOT EXISTS public.student_units (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_year   TEXT NOT NULL, -- e.g. "2025-2026"
  semester      SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 2),
  grade         NUMERIC(4,2) CHECK (grade IS NULL OR (grade >= 1 AND grade <= 5)), -- 1.0 to 5.0
  status        TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'passed', 'failed', 'dropped', 'incomplete')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, subject_id, school_year, semester)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.curriculum_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_units ENABLE ROW LEVEL SECURITY;

-- 5. Define RLS Policies
-- curriculum_requirements
DROP POLICY IF EXISTS "Requirements readable by all" ON public.curriculum_requirements;
CREATE POLICY "Requirements readable by all"
  ON public.curriculum_requirements FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins can manage requirements" ON public.curriculum_requirements;
CREATE POLICY "Only admins can manage requirements"
  ON public.curriculum_requirements FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- subjects
DROP POLICY IF EXISTS "Subjects readable by all" ON public.subjects;
CREATE POLICY "Subjects readable by all"
  ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins can manage subjects" ON public.subjects;
CREATE POLICY "Only admins can manage subjects"
  ON public.subjects FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- student_units — students only ever see/affect their own rows
DROP POLICY IF EXISTS "Students can read own units" ON public.student_units;
CREATE POLICY "Students can read own units"
  ON public.student_units FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can insert own units" ON public.student_units;
CREATE POLICY "Students can insert own units"
  ON public.student_units FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can update own units" ON public.student_units;
CREATE POLICY "Students can update own units"
  ON public.student_units FOR UPDATE USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can delete own units" ON public.student_units;
CREATE POLICY "Students can delete own units"
  ON public.student_units FOR DELETE USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all student units" ON public.student_units;
CREATE POLICY "Admins can read all student units"
  ON public.student_units FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6. Seed Curriculum Requirements
-- Totals match the seeded checklist below, so a fully-passed student
-- reaches exactly 100% on the tracker.
INSERT INTO public.curriculum_requirements (program, total_units, total_subjects)
VALUES ('BSCoE', 124, 43)
ON CONFLICT (program) DO UPDATE SET total_units = EXCLUDED.total_units, total_subjects = EXCLUDED.total_subjects;

INSERT INTO public.curriculum_requirements (program, total_units, total_subjects)
VALUES ('BSCE', 129, 44)
ON CONFLICT (program) DO UPDATE SET total_units = EXCLUDED.total_units, total_subjects = EXCLUDED.total_subjects;

INSERT INTO public.curriculum_requirements (program, total_units, total_subjects)
VALUES ('BSECE', 127, 43)
ON CONFLICT (program) DO UPDATE SET total_units = EXCLUDED.total_units, total_subjects = EXCLUDED.total_subjects;

-- 7. Seed subjects — BSCoE (43 subjects, 124 units)
INSERT INTO public.subjects (code, title, units, program, year_level, semester) VALUES
  ('MATH111', 'Calculus 1', 3, 'BSCoE', 1, 1),
  ('CHEM111', 'Chemistry for Engineers', 3, 'BSCoE', 1, 1),
  ('ENGG111', 'Introduction to Engineering', 2, 'BSCoE', 1, 1),
  ('COE111', 'Computer Engineering as a Discipline', 1, 'BSCoE', 1, 1),
  ('NSTP1', 'National Service Training Program 1', 3, 'BSCoE', 1, 1),
  ('GE111', 'Understanding the Self', 3, 'BSCoE', 1, 1),
  ('MATH112', 'Calculus 2', 3, 'BSCoE', 1, 2),
  ('PHYS111', 'Physics for Engineers 1', 4, 'BSCoE', 1, 2),
  ('COE112', 'Programming Logic and Design', 3, 'BSCoE', 1, 2),
  ('NSTP2', 'National Service Training Program 2', 3, 'BSCoE', 1, 2),
  ('GE112', 'Readings in Philippine History', 3, 'BSCoE', 1, 2),
  ('MATH211', 'Differential Equations', 3, 'BSCoE', 2, 1),
  ('PHYS112', 'Physics for Engineers 2', 4, 'BSCoE', 2, 1),
  ('COE211', 'Object-Oriented Programming', 3, 'BSCoE', 2, 1),
  ('COE212', 'Discrete Mathematics', 3, 'BSCoE', 2, 1),
  ('GE113', 'The Contemporary World', 3, 'BSCoE', 2, 1),
  ('MATH212', 'Advanced Mathematics for COE', 3, 'BSCoE', 2, 2),
  ('COE221', 'Data Structures and Algorithms', 3, 'BSCoE', 2, 2),
  ('COE222', 'Software Design', 3, 'BSCoE', 2, 2),
  ('COE223', 'Circuits 1', 4, 'BSCoE', 2, 2),
  ('GE114', 'Purposive Communication', 3, 'BSCoE', 2, 2),
  ('COE311', 'Operating Systems', 3, 'BSCoE', 3, 1),
  ('COE312', 'Computer Architecture', 3, 'BSCoE', 3, 1),
  ('COE313', 'Digital Systems Design', 3, 'BSCoE', 3, 1),
  ('MATH311', 'Numerical Methods', 3, 'BSCoE', 3, 1),
  ('GE311', 'Ethics', 3, 'BSCoE', 3, 1),
  ('PE101', 'Physical Education 1', 2, 'BSCoE', 3, 1),
  ('COE321', 'Database Systems', 3, 'BSCoE', 3, 2),
  ('COE322', 'Computer Networks', 3, 'BSCoE', 3, 2),
  ('COE323', 'Microprocessor Systems', 3, 'BSCoE', 3, 2),
  ('COE324', 'Software Engineering', 3, 'BSCoE', 3, 2),
  ('GE312', 'Science, Technology and Society', 3, 'BSCoE', 3, 2),
  ('PE102', 'Physical Education 2', 2, 'BSCoE', 3, 2),
  ('COE411', 'Artificial Intelligence', 3, 'BSCoE', 4, 1),
  ('COE412', 'Systems Integration and Architecture', 3, 'BSCoE', 4, 1),
  ('COE413', 'Capstone Project 1', 3, 'BSCoE', 4, 1),
  ('GE313', 'Life and Works of Rizal', 3, 'BSCoE', 4, 1),
  ('PE103', 'Physical Education 3', 2, 'BSCoE', 4, 1),
  ('COE421', 'Capstone Project 2', 3, 'BSCoE', 4, 2),
  ('COE422', 'Embedded Systems Design', 3, 'BSCoE', 4, 2),
  ('COE423', 'Seminars and Comprehensive Review', 1, 'BSCoE', 4, 2),
  ('GE314', 'Art Appreciation', 3, 'BSCoE', 4, 2),
  ('COE424', 'Practicum / On-the-Job Training', 3, 'BSCoE', 4, 2)
ON CONFLICT (program, code) DO NOTHING;

-- Seed subjects — BSCE (44 subjects, 129 units)
INSERT INTO public.subjects (code, title, units, program, year_level, semester) VALUES
  ('MATH111', 'Calculus 1', 3, 'BSCE', 1, 1),
  ('CHEM111', 'Chemistry for Engineers', 3, 'BSCE', 1, 1),
  ('ENGG111', 'Introduction to Engineering', 2, 'BSCE', 1, 1),
  ('CE111', 'Civil Engineering Orientation', 1, 'BSCE', 1, 1),
  ('NSTP1', 'National Service Training Program 1', 3, 'BSCE', 1, 1),
  ('GE111', 'Understanding the Self', 3, 'BSCE', 1, 1),
  ('MATH112', 'Calculus 2', 3, 'BSCE', 1, 2),
  ('PHYS111', 'Physics for Engineers 1', 4, 'BSCE', 1, 2),
  ('CE112', 'Geotechnical Engineering 1', 3, 'BSCE', 1, 2),
  ('NSTP2', 'National Service Training Program 2', 3, 'BSCE', 1, 2),
  ('GE112', 'Readings in Philippine History', 3, 'BSCE', 1, 2),
  ('MATH211', 'Differential Equations', 3, 'BSCE', 2, 1),
  ('PHYS112', 'Physics for Engineers 2', 4, 'BSCE', 2, 1),
  ('CE211', 'Engineering Mechanics 1', 3, 'BSCE', 2, 1),
  ('CE212', 'Surveying 1', 4, 'BSCE', 2, 1),
  ('GE113', 'The Contemporary World', 3, 'BSCE', 2, 1),
  ('CE221', 'Engineering Mechanics 2', 3, 'BSCE', 2, 2),
  ('CE222', 'Strength of Materials', 4, 'BSCE', 2, 2),
  ('CE223', 'Construction Materials and Methods', 3, 'BSCE', 2, 2),
  ('MATH221', 'Engineering Data Analysis', 3, 'BSCE', 2, 2),
  ('GE114', 'Purposive Communication', 3, 'BSCE', 2, 2),
  ('CE311', 'Structural Theory 1', 4, 'BSCE', 3, 1),
  ('CE312', 'Fluid Mechanics', 3, 'BSCE', 3, 1),
  ('CE313', 'Hydrology', 3, 'BSCE', 3, 1),
  ('CE314', 'Engineering Economics', 3, 'BSCE', 3, 1),
  ('GE311', 'Ethics', 3, 'BSCE', 3, 1),
  ('PE101', 'Physical Education 1', 2, 'BSCE', 3, 1),
  ('CE321', 'Structural Theory 2', 4, 'BSCE', 3, 2),
  ('CE322', 'Geotechnical Engineering 2', 3, 'BSCE', 3, 2),
  ('CE323', 'Transportation Engineering', 3, 'BSCE', 3, 2),
  ('CE324', 'Steel Design', 3, 'BSCE', 3, 2),
  ('CE325', 'Reinforced Concrete Design', 3, 'BSCE', 3, 2),
  ('PE102', 'Physical Education 2', 2, 'BSCE', 3, 2),
  ('CE411', 'Construction Methods and Project Management', 3, 'BSCE', 4, 1),
  ('CE412', 'Water and Wastewater Engineering', 3, 'BSCE', 4, 1),
  ('CE413', 'CE Capstone Project 1', 3, 'BSCE', 4, 1),
  ('CE414', 'Foundation Design', 3, 'BSCE', 4, 1),
  ('GE313', 'Life and Works of Rizal', 3, 'BSCE', 4, 1),
  ('PE103', 'Physical Education 3', 2, 'BSCE', 4, 1),
  ('CE421', 'CE Capstone Project 2', 3, 'BSCE', 4, 2),
  ('CE422', 'Professional Practice / OJT', 3, 'BSCE', 4, 2),
  ('CE423', 'CE Seminars', 1, 'BSCE', 4, 2),
  ('GE314', 'Art Appreciation', 3, 'BSCE', 4, 2),
  ('CE424', 'CE Laws and Contracts', 2, 'BSCE', 4, 2)
ON CONFLICT (program, code) DO NOTHING;

-- Seed subjects — BSECE (43 subjects, 127 units)
INSERT INTO public.subjects (code, title, units, program, year_level, semester) VALUES
  ('MATH111', 'Calculus 1', 3, 'BSECE', 1, 1),
  ('CHEM111', 'Chemistry for Engineers', 3, 'BSECE', 1, 1),
  ('ENGG111', 'Introduction to Engineering', 2, 'BSECE', 1, 1),
  ('ECE111', 'ECE Orientation', 1, 'BSECE', 1, 1),
  ('NSTP1', 'National Service Training Program 1', 3, 'BSECE', 1, 1),
  ('GE111', 'Understanding the Self', 3, 'BSECE', 1, 1),
  ('MATH112', 'Calculus 2', 3, 'BSECE', 1, 2),
  ('PHYS111', 'Physics for Engineers 1', 4, 'BSECE', 1, 2),
  ('ECE112', 'Programming Logic and Design', 3, 'BSECE', 1, 2),
  ('NSTP2', 'National Service Training Program 2', 3, 'BSECE', 1, 2),
  ('GE112', 'Readings in Philippine History', 3, 'BSECE', 1, 2),
  ('MATH211', 'Differential Equations', 3, 'BSECE', 2, 1),
  ('PHYS112', 'Physics for Engineers 2', 4, 'BSECE', 2, 1),
  ('ECE211', 'Circuits 1', 4, 'BSECE', 2, 1),
  ('ECE212', 'Electromagnetics 1', 3, 'BSECE', 2, 1),
  ('GE113', 'The Contemporary World', 3, 'BSECE', 2, 1),
  ('ECE221', 'Circuits 2', 4, 'BSECE', 2, 2),
  ('ECE222', 'Electronic Devices and Circuits', 4, 'BSECE', 2, 2),
  ('MATH221', 'Engineering Data Analysis', 3, 'BSECE', 2, 2),
  ('GE114', 'Purposive Communication', 3, 'BSECE', 2, 2),
  ('ECE311', 'Signals, Spectra and Signal Processing', 3, 'BSECE', 3, 1),
  ('ECE312', 'Electronics 2', 4, 'BSECE', 3, 1),
  ('ECE313', 'Digital Electronics', 3, 'BSECE', 3, 1),
  ('ECE314', 'Communications 1', 3, 'BSECE', 3, 1),
  ('GE311', 'Ethics', 3, 'BSECE', 3, 1),
  ('PE101', 'Physical Education 1', 2, 'BSECE', 3, 1),
  ('ECE321', 'Communications 2', 3, 'BSECE', 3, 2),
  ('ECE322', 'Control Systems', 3, 'BSECE', 3, 2),
  ('ECE323', 'Electromagnetics 2', 3, 'BSECE', 3, 2),
  ('ECE324', 'Microprocessors and Microcontrollers', 4, 'BSECE', 3, 2),
  ('GE312', 'Science, Technology and Society', 3, 'BSECE', 3, 2),
  ('PE102', 'Physical Education 2', 2, 'BSECE', 3, 2),
  ('ECE411', 'Electronic Systems Design (Capstone 1)', 3, 'BSECE', 4, 1),
  ('ECE412', 'Digital Signal Processing', 3, 'BSECE', 4, 1),
  ('ECE413', 'Practicum / OJT 1', 3, 'BSECE', 4, 1),
  ('ECE414', 'Data Communications', 3, 'BSECE', 4, 1),
  ('GE313', 'Life and Works of Rizal', 3, 'BSECE', 4, 1),
  ('PE103', 'Physical Education 3', 2, 'BSECE', 4, 1),
  ('ECE421', 'ECE Capstone 2', 3, 'BSECE', 4, 2),
  ('ECE422', 'ECE Seminars', 1, 'BSECE', 4, 2),
  ('ECE423', 'Special Topics in ECE', 2, 'BSECE', 4, 2),
  ('GE314', 'Art Appreciation', 3, 'BSECE', 4, 2),
  ('ECE424', 'ECE Laws and Professional Ethics', 3, 'BSECE', 4, 2)
ON CONFLICT (program, code) DO NOTHING;
