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
