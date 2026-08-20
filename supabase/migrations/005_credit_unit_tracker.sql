-- =============================================
-- Migration: 005_credit_unit_tracker.sql
-- COE Credit Unit Tracker Schema & Policies
--
-- Curriculum data is transcribed from the official PROSPECTUS.docx:
--   BSCoE — BS Computer Engineering      189 units / 67 subjects
--   BSECE — BS Electronics Engineering   204 units / 68 subjects
--   BSCE  — Civil Engineering            213 units / 75 subjects
--
-- Re-runnable: drops and recreates the three tables, so this file can
-- be re-applied over the original draft migration (which carried a
-- placeholder curriculum) — running it always yields the final state.
-- =============================================

DROP TABLE IF EXISTS public.student_units CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.curriculum_requirements CASCADE;

-- 1. Create curriculum_requirements table
CREATE TABLE public.curriculum_requirements (
  program           TEXT PRIMARY KEY CHECK (program IN ('BSCoE', 'BSCE', 'BSECE')),
  total_units       SMALLINT NOT NULL,
  total_subjects    SMALLINT NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create subjects table
CREATE TABLE public.subjects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT NOT NULL,
  title         TEXT NOT NULL,
  units         SMALLINT NOT NULL,
  program       TEXT NOT NULL REFERENCES public.curriculum_requirements(program) ON DELETE CASCADE,
  year_level    SMALLINT NOT NULL CHECK (year_level BETWEEN 1 AND 4),
  semester      SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 3), -- 3 = Summer term
  prerequisites TEXT, -- e.g. 'EMath 111', 'CpE 223; CpE 112', '2nd Yr Standing', 'Co-req CpE 223'
  is_elective   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (program, code)
);

-- 3. Create student_units table
CREATE TABLE public.student_units (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  school_year   TEXT NOT NULL, -- e.g. "2025-2026"
  semester      SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 3), -- 3 = Summer term
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

-- 6. Seed Curriculum Requirements (totals from PROSPECTUS.docx)
INSERT INTO public.curriculum_requirements (program, total_units, total_subjects)
VALUES ('BSCoE', 189, 67)
ON CONFLICT (program) DO UPDATE SET total_units = EXCLUDED.total_units, total_subjects = EXCLUDED.total_subjects;

INSERT INTO public.curriculum_requirements (program, total_units, total_subjects)
VALUES ('BSECE', 204, 68)
ON CONFLICT (program) DO UPDATE SET total_units = EXCLUDED.total_units, total_subjects = EXCLUDED.total_subjects;

INSERT INTO public.curriculum_requirements (program, total_units, total_subjects)
VALUES ('BSCE', 213, 75)
ON CONFLICT (program) DO UPDATE SET total_units = EXCLUDED.total_units, total_subjects = EXCLUDED.total_subjects;

-- 7. Seed subjects — BSCoE (67 subjects, 189 units)
-- Columns: (code, title, units, program, year_level, semester, prerequisites, is_elective)
INSERT INTO public.subjects (code, title, units, program, year_level, semester, prerequisites, is_elective) VALUES
  ('RS 1',    'God''s Salvific Act',                            3, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('CpE 111', 'Computer Engineering as a Discipline',           1, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('CpE 112', 'Programming Logic and Design',                   2, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('CpE 113', 'Computer System Servicing',                      1, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('EMath 100', 'Math of Engineering',                          3, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('EMath 111', 'Calculus 1',                                   4, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('EChem 111', 'Chemistry for Engineers',                      4, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('Gen Ed 4', 'Mathematics in the World',                      3, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('PE 1',    'Physical Education 1',                           2, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('NSTP 1',  'NSTP 1',                                         3, 'BSCoE', 1, 1, NULL,                      FALSE),
  ('RS 2',    'Jesus the Kingdom of God',                       3, 'BSCoE', 1, 2, 'RS 1',                    FALSE),
  ('CpE 121', 'Object Oriented Programming',                    2, 'BSCoE', 1, 2, 'CpE 112',                  FALSE),
  ('EMath 121', 'Calculus 2',                                   4, 'BSCoE', 1, 2, 'EMath 111',                FALSE),
  ('EMath 122', 'Discrete Mathematics',                         3, 'BSCoE', 1, 2, 'EMath 111',                FALSE),
  ('EPhys 121', 'Physics for Engineers',                        4, 'BSCoE', 1, 2, 'EMath 111',                FALSE),
  ('Gen Ed 1', 'Understanding the Self',                        3, 'BSCoE', 1, 2, NULL,                      FALSE),
  ('GE E1',   'General Education Elective 1',                   3, 'BSCoE', 1, 2, NULL,                      TRUE),
  ('PE 2',    'Physical Education 2',                           2, 'BSCoE', 1, 2, 'PE 1',                     FALSE),
  ('NSTP 2',  'NSTP 2',                                         3, 'BSCoE', 1, 2, 'NSTP 1',                   FALSE),
  ('RS 3',    'The Church and Her Celebrations',                3, 'BSCoE', 2, 1, 'RS 2',                     FALSE),
  ('CpE 211', 'Data Structures and Algorithms',                 2, 'BSCoE', 2, 1, 'CpE 121',                  FALSE),
  ('CpE 212', 'Fundamentals of Electric Circuits',              4, 'BSCoE', 2, 1, 'EPhys 121',                FALSE),
  ('EMath 211', 'Differential Equations',                       3, 'BSCoE', 2, 1, 'EMath 121',                FALSE),
  ('ES 211',  'Engineering Economics',                          3, 'BSCoE', 2, 1, '2nd Yr Standing',           FALSE),
  ('Gen Ed 6', 'Arts Appreciation',                             3, 'BSCoE', 2, 1, NULL,                      FALSE),
  ('Gen Ed 7', 'Science, Technology and Society',               3, 'BSCoE', 2, 1, NULL,                      FALSE),
  ('PE 3',    'Physical Education 3',                           2, 'BSCoE', 2, 1, 'PE 2',                     FALSE),
  ('SklDrv',  'Basic Skill in Driving',                         1, 'BSCoE', 2, 1, NULL,                      FALSE),
  ('RS 4',    'Christian Discipleship: Stewardship & Morality', 3, 'BSCoE', 2, 2, 'RS 3',                     FALSE),
  ('CpE 221', 'Numerical Methods',                              4, 'BSCoE', 2, 2, 'EMath 211',                FALSE),
  ('CpE 222', 'Software Design',                                4, 'BSCoE', 2, 2, 'CpE 211',                  FALSE),
  ('CpE 223', 'Fundamentals of Electronic Circuits',            4, 'BSCoE', 2, 2, 'CpE 212',                  FALSE),
  ('ES 221',  'Computer-Aided Drafting',                        1, 'BSCoE', 2, 2, '2nd Yr Standing',           FALSE),
  ('Gen Ed 5', 'Purposive Communication',                       3, 'BSCoE', 2, 2, NULL,                      FALSE),
  ('Gen Ed 8', 'Ethics',                                        3, 'BSCoE', 2, 2, NULL,                      FALSE),
  ('PE 4',    'Physical Education 4',                           2, 'BSCoE', 2, 2, 'PE 3',                     FALSE),
  ('CpE 311', 'Logic Circuits and Design',                      4, 'BSCoE', 3, 1, 'CpE 223',                  FALSE),
  ('CpE 312', 'Methods of Research',                            2, 'BSCoE', 3, 1, 'EMath 123',                FALSE),
  ('CpE 313', 'Data and Digital Communications',                3, 'BSCoE', 3, 1, 'CpE 223',                  FALSE),
  ('CpE 315', 'Feedback and Control Systems',                   3, 'BSCoE', 3, 1, 'CpE 223; CpE 112',         FALSE),
  ('CpE 316', 'Fundamentals of Mixed Signals and Sensors',      3, 'BSCoE', 3, 1, 'CpE 212',                  FALSE),
  ('CpE 317', 'Computer Engineering Drafting and Design',       1, 'BSCoE', 3, 1, 'CpE 223',                  FALSE),
  ('CpE 318', 'Computer Architecture and Organization',         4, 'BSCoE', 3, 1, 'Co-req CpE 223',           FALSE),
  ('EMath 311', 'Engineering Data Analysis',                    3, 'BSCoE', 3, 1, 'EMath 111',                FALSE),
  ('GE E2',   'General Education Elective 2',                   3, 'BSCoE', 3, 1, NULL,                      TRUE),
  ('CpE 321', 'Basic Occupational Health and Safety',           3, 'BSCoE', 3, 2, '3rd Yr Standing',           FALSE),
  ('CpE 322', 'Computer Networks and Security',                 4, 'BSCoE', 3, 2, 'CpE 313',                  FALSE),
  ('CpE 323', 'Microprocessor',                                 4, 'BSCoE', 3, 2, 'CpE 311',                  FALSE),
  ('CpE 324', 'Operating System',                               3, 'BSCoE', 3, 2, 'CpE 211',                  FALSE),
  ('CpE 325', 'Cognate/Elective 1',                             3, 'BSCoE', 3, 2, NULL,                      TRUE),
  ('CpE 327', 'Introduction to HDL',                            1, 'BSCoE', 3, 2, 'CpE 112; CpE 223',         FALSE),
  ('ES 321',  'Technopreneurship',                              3, 'BSCoE', 3, 2, '3rd Yr Standing',           FALSE),
  ('Gen Ed 9', 'Life and Works of Rizal',                       3, 'BSCoE', 3, 2, NULL,                      FALSE),
  ('CpE 411', 'CpE Practice Design 1',                          1, 'BSCoE', 4, 1, 'CpE 323; CpE 324',         FALSE),
  ('CpE 413', 'Embedded Systems',                               4, 'BSCoE', 4, 1, 'CpE 323',                  FALSE),
  ('CpE 414', 'Digital Signal Processing',                      4, 'BSCoE', 4, 1, 'CpE 315',                  FALSE),
  ('CpE 415', 'Cognate/Elective 2',                             3, 'BSCoE', 4, 1, '4th Yr Standing',           TRUE),
  ('CpE 416', 'Cognate/Elective 3',                             3, 'BSCoE', 4, 1, '4th Yr Standing',           TRUE),
  ('FL 1',    'Foreign Language',                               3, 'BSCoE', 4, 1, NULL,                      FALSE),
  ('Gen Ed 2', 'Readings in Philippine History',                3, 'BSCoE', 4, 1, NULL,                      FALSE),
  ('Gen Ed 3', 'Contemporary World',                            3, 'BSCoE', 4, 1, NULL,                      FALSE),
  ('CpE 421', 'CpE Practice and Design 2',                      2, 'BSCoE', 4, 2, 'CpE 411',                  FALSE),
  ('CpE 422', 'Seminars and Field Trips',                       1, 'BSCoE', 4, 2, '4th Yr Standing',           FALSE),
  ('CpE 423', 'On the Job Training',                            3, 'BSCoE', 4, 2, '*240 hours / 4th Yr Standing', FALSE),
  ('CpE 424', 'Emerging Technologies in CpE',                   3, 'BSCoE', 4, 2, '3rd Yr Standing',           FALSE),
  ('CpE 425', 'CpE Laws and Professional Practice',             2, 'BSCoE', 4, 2, '2nd Yr Standing',           FALSE),
  ('GE E3',   'General Education Elective 3',                   3, 'BSCoE', 4, 2, NULL,                      TRUE)
ON CONFLICT (program, code) DO NOTHING;

-- Seed subjects — BSECE (68 subjects, 204 units)
INSERT INTO public.subjects (code, title, units, program, year_level, semester, prerequisites, is_elective) VALUES
  ('RS 1',    'God''s Salvific Act',                            3, 'BSECE', 1, 1, NULL,                      FALSE),
  ('EMath 100', 'Mathematics for Engineers',                    3, 'BSECE', 1, 1, NULL,                      FALSE),
  ('EMath 111', 'Calculus 1',                                   4, 'BSECE', 1, 1, NULL,                      FALSE),
  ('EChem 111', 'Chemistry for Engineers',                      4, 'BSECE', 1, 1, NULL,                      FALSE),
  ('Comp 111', 'Basic Computer Programming',                    1, 'BSECE', 1, 1, NULL,                      FALSE),
  ('Gen Ed 2', 'Readings in Philippine History',                3, 'BSECE', 1, 1, NULL,                      FALSE),
  ('Gen Ed 4', 'Mathematics in the Modern World',               3, 'BSECE', 1, 1, NULL,                      FALSE),
  ('PE 1',    'Physical Education 1',                           2, 'BSECE', 1, 1, NULL,                      FALSE),
  ('NSTP 1',  'NSTP 1',                                         3, 'BSECE', 1, 1, NULL,                      FALSE),
  ('RS 2',    'Jesus and the Kingdom of God',                   3, 'BSECE', 1, 2, 'RS 1',                    FALSE),
  ('Comp 121', 'Computer Programming',                          2, 'BSECE', 1, 2, 'Comp 111',                 FALSE),
  ('EMath 121', 'Calculus 2',                                   4, 'BSECE', 1, 2, 'EMath 111',                FALSE),
  ('EPhys 121', 'Physics for Engineers',                        4, 'BSECE', 1, 2, 'EMath 111',                FALSE),
  ('EPhys 122', 'Physics 2',                                    4, 'BSECE', 1, 2, 'Co: Ephys 121',            FALSE),
  ('ECE 121', 'Materials Science and Engineering',              3, 'BSECE', 1, 2, 'EChem 111',                FALSE),
  ('EDraw 121', 'Computer-Aided Drafting',                      1, 'BSECE', 1, 2, NULL,                      FALSE),
  ('PE 2',    'Physical Education 2',                           2, 'BSECE', 1, 2, 'PE 1',                     FALSE),
  ('NSTP 2',  'NSTP 2',                                         3, 'BSECE', 1, 2, 'NSTP 1',                   FALSE),
  ('RS 3',    'The Church and Her Celebrations',                3, 'BSECE', 2, 1, 'RS 2',                     FALSE),
  ('ECE 210', 'Electronics Engineering Drafting and Design',    1, 'BSECE', 2, 1, NULL,                      FALSE),
  ('EMath 211', 'Differential Equations',                       3, 'BSECE', 2, 1, 'EMath 121',                FALSE),
  ('ECE 211', 'Circuits 1',                                     4, 'BSECE', 2, 1, 'Ephys 122',                FALSE),
  ('ECE 212', 'Electronics 1: Electronics Devices and Circuits',4, 'BSECE', 2, 1, 'Co: ECE 211',              FALSE),
  ('ES 211',  'Engineering Management',                         2, 'BSECE', 2, 1, NULL,                      FALSE),
  ('Gen Ed 3', 'The Contemporary World',                        3, 'BSECE', 2, 1, NULL,                      FALSE),
  ('Gen Ed 6', 'Art Appreciation',                              3, 'BSECE', 2, 1, NULL,                      FALSE),
  ('Gen Ed 7', 'Science, Technology and Society',               3, 'BSECE', 2, 1, NULL,                      FALSE),
  ('PE 3',    'Physical Education 3',                           2, 'BSECE', 2, 1, 'PE 2',                     FALSE),
  ('RS 4',    'Christian Discipleship: Stewardship & Morality', 3, 'BSECE', 2, 2, 'RS 3',                     FALSE),
  ('EMath 221', 'Advanced Engineering Mathematics for ECE',     4, 'BSECE', 2, 2, 'EMath 211',                FALSE),
  ('ECE 221', 'Circuits 2',                                     4, 'BSECE', 2, 2, 'ECE 211',                  FALSE),
  ('ECE 222', 'Electronics 2: Electronics Circuit Analysis and Design', 4, 'BSECE', 2, 2, 'ECE 212', FALSE),
  ('ECE 223', 'Communications 1: Principles of Communication Systems', 4, 'BSECE', 2, 2, 'Co: ECE 222', FALSE),
  ('ECE 224', 'Electromagnetics',                               4, 'BSECE', 2, 2, 'Emath 211',                FALSE),
  ('Gen Ed 1', 'Understanding the Self',                        3, 'BSECE', 2, 2, NULL,                      FALSE),
  ('PE 4',    'Physical Education 4',                           2, 'BSECE', 2, 2, 'PE 3',                     FALSE),
  ('ECE 312', 'Electronics 3: Electronic Systems and Design',   4, 'BSECE', 3, 1, 'ECE 222',                  FALSE),
  ('ECE 313', 'Communications 2: Modulation and Coding Techniques', 4, 'BSECE', 3, 1, 'ECE 223',           FALSE),
  ('ECE 314', 'Digital Electronics 1: Logic Circuits and Design', 4, 'BSECE', 3, 1, 'ECE 212',              FALSE),
  ('ECE 315', 'Feedback and Control Systems',                   4, 'BSECE', 3, 1, 'Emath 221',                FALSE),
  ('EMath 311', 'Engineering Data Analysis',                    3, 'BSECE', 3, 1, NULL,                      FALSE),
  ('ES 311',  'Engineering Economics',                          3, 'BSECE', 3, 1, NULL,                      FALSE),
  ('ECE 316', 'Methods of Research',                            3, 'BSECE', 3, 1, '3rd Year Standing',         FALSE),
  ('GE L1',   'General Education Elective 1',                   3, 'BSECE', 3, 1, NULL,                      TRUE),
  ('ECE 323', 'Communications 3: Data Communications',          4, 'BSECE', 3, 2, 'ECE 313',                  FALSE),
  ('ECE 324', 'Communications 4: Transmission Media and Antenna System and Design', 4, 'BSECE', 3, 2, 'ECE 313', FALSE),
  ('ECE 325', 'Digital Electronics 2: Microprocessor, Microcontroller System and Design', 4, 'BSECE', 3, 2, 'ECE 314', FALSE),
  ('ECE 326', 'Signals, Spectra and Signal Processing',        4, 'BSECE', 3, 2, 'Emath 221',                FALSE),
  ('ES 321',  'Environmental Science and Engineering',          3, 'BSECE', 3, 2, NULL,                      FALSE),
  ('Gen Ed 5', 'Purposive Communication',                       3, 'BSECE', 3, 2, NULL,                      FALSE),
  ('GE L2',   'General Education Elective 2',                   3, 'BSECE', 3, 2, NULL,                      TRUE),
  ('ES 322',  'Technopreneurship',                              3, 'BSECE', 3, 2, NULL,                      FALSE),
  ('ECE 410', 'Design 1/Capstone Project 1',                    1, 'BSECE', 4, 1, '4th Year Standing',         FALSE),
  ('ECE L1',  'ECE Elective 1',                                 4, 'BSECE', 4, 1, '4th Year Standing',         TRUE),
  ('ECE 411', 'Seminars/Colloquium',                            1, 'BSECE', 4, 1, '4th Year Standing',         FALSE),
  ('ECE 412', 'ECE Laws, Contracts, Ethics, Standards and Safety', 3, 'BSECE', 4, 1, NULL,                  FALSE),
  ('ECE 413', 'ECE Correlation Course 1',                       3, 'BSECE', 4, 1, NULL,                      FALSE),
  ('ECE 414', 'ECE Correlation Course 2',                       3, 'BSECE', 4, 1, NULL,                      FALSE),
  ('Gen Ed 8', 'Ethics',                                        3, 'BSECE', 4, 1, NULL,                      FALSE),
  ('Gen Ed 9', 'Life and Works of Rizal',                       3, 'BSECE', 4, 1, NULL,                      FALSE),
  ('FL 1',    'Foreign Language',                               3, 'BSECE', 4, 1, NULL,                      FALSE),
  ('Skl Dev 1', 'Computer System Servicing',                    1, 'BSECE', 4, 1, NULL,                      FALSE),
  ('Skl Dev 2', 'Driving Mechanics',                            1, 'BSECE', 4, 1, NULL,                      FALSE),
  ('ECE 420', 'Design 2/Capstone Project 2',                    1, 'BSECE', 4, 2, 'ECE 410',                  FALSE),
  ('ECE L2',  'ECE Elective 2',                                 4, 'BSECE', 4, 2, 'ECE L1',                   TRUE),
  ('GE L3',   'General Education Elective 3',                   3, 'BSECE', 4, 2, NULL,                      TRUE),
  ('ECE 423', 'ECE Correlation Course 3',                       3, 'BSECE', 4, 2, NULL,                      FALSE),
  ('ECE 400', 'On-the-Job Training - 320 Hours',                3, 'BSECE', 4, 2, NULL,                      FALSE)
ON CONFLICT (program, code) DO NOTHING;

-- Seed subjects — BSCE (75 subjects, 213 units; 3rd year Summer term = semester 3)
INSERT INTO public.subjects (code, title, units, program, year_level, semester, prerequisites, is_elective) VALUES
  ('RS 1',    'God''s Salvific Act',                            3, 'BSCE', 1, 1, NULL,                       FALSE),
  ('EMath 100', 'Mathematics of Engineering',                   3, 'BSCE', 1, 1, NULL,                       FALSE),
  ('EMath 111', 'Calculus 1 (Differential Calculus)',           4, 'BSCE', 1, 1, NULL,                       FALSE),
  ('EDraw 111', 'Engineering Drawings and Plans',               2, 'BSCE', 1, 1, NULL,                       FALSE),
  ('CE 100',  'Civil Engineering Orientation',                  2, 'BSCE', 1, 1, NULL,                       FALSE),
  ('GEN ED 2', 'Readings in Philippine History',                3, 'BSCE', 1, 1, NULL,                       FALSE),
  ('GEN ED 3', 'Contemporary World',                            3, 'BSCE', 1, 1, NULL,                       FALSE),
  ('GEN ED 4', 'Mathematics in the Modern World',               3, 'BSCE', 1, 1, NULL,                       FALSE),
  ('PE 1',    'Physical Education 1',                           2, 'BSCE', 1, 1, NULL,                       FALSE),
  ('NSTP 1',  'NSTP 1',                                         3, 'BSCE', 1, 1, NULL,                       FALSE),
  ('RS 2',    'Jesus and The Kingdom of God',                   3, 'BSCE', 1, 2, 'RS 1',                     FALSE),
  ('EMath 121', 'Calculus 2 (Integral Calculus)',               4, 'BSCE', 1, 2, 'EMath 100, EMath 111',      FALSE),
  ('EPhys 121', 'Physics for Engineers (Calculus-based)',       4, 'BSCE', 1, 2, 'EMath 111, co-requisite: EMath 121', FALSE),
  ('EChem 121', 'Chemistry for Engineers',                      4, 'BSCE', 1, 2, NULL,                       FALSE),
  ('Comp 121', 'Computer Fundamentals and Programming',         2, 'BSCE', 1, 2, NULL,                       FALSE),
  ('GE L1',   'General Elective 1',                             3, 'BSCE', 1, 2, NULL,                       TRUE),
  ('GEN ED 6', 'Arts Appreciation',                             3, 'BSCE', 1, 2, NULL,                       FALSE),
  ('PE 2',    'Physical Education 2',                           2, 'BSCE', 1, 2, 'PE 1',                      FALSE),
  ('NSTP 2',  'NSTP 2',                                         3, 'BSCE', 1, 2, 'NSTP 1',                    FALSE),
  ('RS 3',    'The Church and Her Celebrations',                3, 'BSCE', 2, 1, 'RS 2',                      FALSE),
  ('GE L2',   'General Elective 2',                             3, 'BSCE', 2, 1, NULL,                       TRUE),
  ('EMath 211', 'Differential Equations',                       3, 'BSCE', 2, 1, 'EMath 121',                 FALSE),
  ('EDraw 211', 'Computer-Aided Drafting',                      1, 'BSCE', 2, 1, 'EDraw 111',                  FALSE),
  ('ESurv 211', 'Fundamentals of Surveying',                    4, 'BSCE', 2, 1, 'EDraw 111',                  FALSE),
  ('CE 211',  'Statics of Rigid Bodies',                        3, 'BSCE', 2, 1, 'EMath 121, EPhys 121',       FALSE),
  ('CE 212',  'Engineering Utilities 1',                        3, 'BSCE', 2, 1, 'EPhys 121',                 FALSE),
  ('EGeo 211', 'Geology For Engineers',                         2, 'BSCE', 2, 1, 'EChem 121',                 FALSE),
  ('GEN ED 7', 'Science, Technology and Society',               3, 'BSCE', 2, 1, NULL,                       FALSE),
  ('PE 3',    'Physical Education 3',                           2, 'BSCE', 2, 1, 'PE 2',                      FALSE),
  ('RS 4',    'Christian Discipleship: Stewardship & Morality', 3, 'BSCE', 2, 2, 'RS 3',                      FALSE),
  ('EMath 221', 'Numerical Solutions to CE Problems',           3, 'BSCE', 2, 2, 'EMath 211',                 FALSE),
  ('CE 221',  'Dynamics of Rigid Bodies',                       2, 'BSCE', 2, 2, 'CE 211; co-requisite: CE 222', FALSE),
  ('CE 222',  'Mechanics of Deformable Bodies',                 4, 'BSCE', 2, 2, 'CE 211',                     FALSE),
  ('CE 223',  'Engineering Economics',                          3, 'BSCE', 2, 2, '2nd Year Standing',          FALSE),
  ('CE 224',  'Highway and Railroad Engineering',               3, 'BSCE', 2, 2, 'ESurv 211',                  FALSE),
  ('CE 225',  'Engineering Utilities 2',                        3, 'BSCE', 2, 2, 'EPhys 121',                  FALSE),
  ('CE 226',  'Hydrology',                                      2, 'BSCE', 2, 2, 'EMath 121',                  FALSE),
  ('GEN ED 1', 'Understanding the Self',                        3, 'BSCE', 2, 2, NULL,                        FALSE),
  ('PE 4',    'Physical Education 4',                           2, 'BSCE', 2, 2, 'PE 3',                       FALSE),
  ('GEN ED 5', 'Purposive Communication',                       3, 'BSCE', 3, 1, NULL,                        FALSE),
  ('EMath 311', 'Engineering Data Analysis',                    3, 'BSCE', 3, 1, '3rd Year Standing',          FALSE),
  ('CE 311',  'Structural Theory',                              5, 'BSCE', 3, 1, 'CE 222',                     FALSE),
  ('CE 312',  'Building Systems Design',                        3, 'BSCE', 3, 1, 'EDraw 111; CE 225',          FALSE),
  ('CE 313',  'Principles of Transportation Engineering',       3, 'BSCE', 3, 1, 'CE 224',                     FALSE),
  ('CE 314',  'Geotechnical Engineering 1 (Soil Mechanics)',    4, 'BSCE', 3, 1, 'EGeo 211, CE 222',           FALSE),
  ('CE 315',  'Construction Materials & Testing',               3, 'BSCE', 3, 1, 'CE 222',                     FALSE),
  ('CE 316',  'Methods of Research for CE',                     3, 'BSCE', 3, 1, '3rd Year Standing',          FALSE),
  ('SMAW',    'Welding Technology',                             1, 'BSCE', 3, 1, NULL,                         FALSE),
  ('GEN ED 8', 'Ethics',                                        3, 'BSCE', 3, 2, NULL,                         FALSE),
  ('GEN ED 9', 'Life and Works of Rizal',                       3, 'BSCE', 3, 2, NULL,                         FALSE),
  ('ES 321',  'Technopreneurship 101',                          3, 'BSCE', 3, 2, '3rd Year Standing',          FALSE),
  ('CE 321',  'Principles of Steel Design',                     3, 'BSCE', 3, 2, 'CE 222; CE 311',             FALSE),
  ('CE 322',  'Principles of Reinforced/Prestressed Concrete',  4, 'BSCE', 3, 2, 'CE 311',                     FALSE),
  ('CE 323',  'Hydraulics',                                     5, 'BSCE', 3, 2, 'CE 221; CE 222',             FALSE),
  ('CE 324',  'Quantity Surveying',                             2, 'BSCE', 3, 2, 'CE 312',                     FALSE),
  ('CE 325',  'Engineering Management',                         2, 'BSCE', 3, 2, '3rd Year Standing',          FALSE),
  ('CE 326',  'CE Special Topics 1',                            3, 'BSCE', 3, 2, 'EMath 311; CE 313',          FALSE),
  ('GE L3',   'General Elective 3',                             3, 'BSCE', 3, 3, '3rd Year Standing',          TRUE),
  ('FL 1',    'Foreign Languages',                              3, 'BSCE', 3, 3, NULL,                         FALSE),
  ('CE 400',  'Safety Management',                              2, 'BSCE', 3, 3, '3rd Year Standing',          FALSE),
  ('Skl Dv 1', 'Driving Mechanics',                             1, 'BSCE', 3, 3, NULL,                         FALSE),
  ('CE 411',  'CE Project 1',                                   2, 'BSCE', 4, 1, '4th Year Standing',          FALSE),
  ('CE 412',  'Construction Methods & Project Mgt',             4, 'BSCE', 4, 1, '4th Year Standing',          FALSE),
  ('CE 413',  'CE Laws, Ethics & Contracts',                    2, 'BSCE', 4, 1, '4th Year Standing',          FALSE),
  ('CE 414',  'Professional Course - Specialized 1',            3, 'BSCE', 4, 1, '4th Year Standing',          TRUE),
  ('CE 415',  'Professional Course - Specialized 2',            3, 'BSCE', 4, 1, '4th Year Standing',          TRUE),
  ('CE 416',  'Professional Course - Specialized 3',            3, 'BSCE', 4, 1, '4th Year Standing',          TRUE),
  ('CE 417',  'Professional Course - Specialized 4',            3, 'BSCE', 4, 1, '4th Year Standing',          TRUE),
  ('CE 418',  'Computer Applications for Civil Engrs',          1, 'BSCE', 4, 1, '4th Year Standing',          FALSE),
  ('CE 419',  'CE Special Topics 2',                            3, 'BSCE', 4, 1, 'CE 326',                     FALSE),
  ('CE 421',  'CE Project 2',                                   2, 'BSCE', 4, 2, 'CE 411',                     FALSE),
  ('CE 422',  'Seminars and Field Trips',                       2, 'BSCE', 4, 2, 'CE 411',                     FALSE),
  ('CE 423',  'Professional Course - Specialized 5',            3, 'BSCE', 4, 2, '4th Year Standing',          TRUE),
  ('CE 424',  'On-the-Job Training',                            3, 'BSCE', 4, 2, '4th Year Standing',          FALSE),
  ('CE 425',  'CE Special Topics 3',                            3, 'BSCE', 4, 2, 'CE 419',                     FALSE)
ON CONFLICT (program, code) DO NOTHING;
