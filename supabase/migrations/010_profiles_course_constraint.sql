-- =============================================
-- Migration: 010_profiles_course_constraint.sql
-- profiles.course historically accepted any free-text value ("BS
-- Nusring", "BS Accountancy"), which broke every downstream feature
-- that resolves a course to a COE program. The signup dropdown already
-- only offers the three canonical codes; this constraint makes the
-- database enforce the same rule. NULL is allowed for accounts with no
-- course recorded (e.g. non-COE admins).
--
-- Re-runnable: the constraint is only added if missing AND no invalid
-- rows exist (adding it with invalid rows would fail loudly, which is
-- the desired behavior — fix the data first).
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_course_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_course_check
      CHECK (course IS NULL OR course IN ('BSCoE', 'BSCE', 'BSECE'));
  END IF;
END $$;
