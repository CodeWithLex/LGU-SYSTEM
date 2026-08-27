-- =============================================
-- Migration: 012_scale_and_google_oauth_indexes.sql
-- Performance, Scalability & Google OAuth Support for 500+ Students
--
-- Features:
-- 1. Updates handle_new_user() trigger for seamless Google OAuth profile sync.
-- 2. Strictly enforces @g.cjc.edu.ph domain for both OAuth and password signups.
-- 3. Adds B-Tree indexes across all core tables to prevent slow full table scans.
-- 4. Optimizes Row Level Security (RLS) execution with cached auth lookup subqueries.
--
-- How to apply: Paste and run in Supabase SQL Editor.
-- =============================================

-- 1. ENHANCED NEW USER TRIGGER (Supports Google OAuth + Email Signups)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_course    TEXT;
  v_year      TEXT;
  v_enroll_yr INTEGER;
BEGIN
  -- Extract name from Google OAuth metadata ('name' or 'full_name') or email signup metadata
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    'COE Student'
  );

  -- Extract course & year if supplied during registration form
  v_course := NULLIF(TRIM(NEW.raw_user_meta_data->>'course'), '');
  v_year   := NULLIF(TRIM(NEW.raw_user_meta_data->>'year_level'), '');
  
  -- Extract enrollment year
  BEGIN
    v_enroll_yr := NULLIF(TRIM(NEW.raw_user_meta_data->>'enrollment_year'), '')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_enroll_yr := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END;
  
  IF v_enroll_yr IS NULL THEN
    v_enroll_yr := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;

  -- Insert profile record
  INSERT INTO public.profiles (id, email, full_name, role, course, year_level, enrollment_year)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    'student', -- Always default to student role (privilege escalation safeguard)
    v_course,
    v_year,
    v_enroll_yr
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = CASE WHEN public.profiles.full_name = 'COE Member' OR public.profiles.full_name = 'COE Student' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger is active on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. SCHOOL EMAIL DOMAIN ENFORCEMENT (@g.cjc.edu.ph)
CREATE OR REPLACE FUNCTION public.enforce_school_email_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR LOWER(NEW.email) NOT LIKE '%@g.cjc.edu.ph' THEN
    RAISE EXCEPTION 'Only Cor Jesu College (@g.cjc.edu.ph) Google accounts are authorized to register.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_before_insert ON auth.users;
CREATE TRIGGER on_auth_user_before_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_school_email_domain();


-- 3. SCALABILITY & CONCURRENCY INDEXES (500+ Active Students)

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_course ON public.profiles (course);
CREATE INDEX IF NOT EXISTS idx_profiles_year_level ON public.profiles (year_level);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_status_date ON public.events (status, event_date);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events (created_at DESC);

-- Transactions Ledger
CREATE INDEX IF NOT EXISTS idx_transactions_event_id ON public.transactions (event_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions (created_at DESC);

-- Receipts
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON public.receipts (transaction_id);

-- Announcements
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements (created_at DESC);

-- Student Units Tracker & Prospectus
CREATE INDEX IF NOT EXISTS idx_student_units_student_id ON public.student_units (student_id);
CREATE INDEX IF NOT EXISTS idx_student_units_subject_id ON public.student_units (subject_id);
CREATE INDEX IF NOT EXISTS idx_student_units_status ON public.student_units (status);
CREATE INDEX IF NOT EXISTS idx_subjects_program_year ON public.subjects (program, year_level, semester);


-- 4. OPTIMIZED RLS POLICIES (Subquery Cache Acceleration)
-- Wrapping auth.uid() in (SELECT auth.uid()) ensures PostgreSQL calculates auth identity once per query instead of per-row.

-- Profiles: Students can update their own academic profile info (course, year, enrollment_year)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));
END $$;
