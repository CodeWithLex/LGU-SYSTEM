-- =============================================
-- Migration: 006_enrollment_year.sql
-- Tracks each student's enrollment year so the Credit
-- Unit Tracker can pre-fill the correct prospectus school
-- year when logging subjects (enrollment_year + year_level - 1).
--
-- Re-runnable: the column add is guarded, and the trigger
-- replacement uses CREATE OR REPLACE.
-- =============================================

-- 1. Add enrollment_year to profiles (nullable - existing rows are untouched,
--    and NULL passes the CHECK constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'enrollment_year'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN enrollment_year INTEGER CHECK (enrollment_year >= 2000 AND enrollment_year <= 2100);
  END IF;
END $$;

-- 2. Capture enrollment_year from signup metadata (defaults to 2026)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, course, year_level, enrollment_year)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'COE Member'),
    'student', -- Hard-coded: role must never come from client-supplied metadata (privilege escalation)
    NEW.raw_user_meta_data->>'course',
    NEW.raw_user_meta_data->>'year_level',
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'enrollment_year', '')::INTEGER, 2026)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
