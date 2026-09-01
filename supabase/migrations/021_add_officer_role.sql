-- =============================================
-- Migration: 021_add_officer_role.sql
-- Add explicit 'officer' role to profiles_role_check and is_officer()
-- =============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
      AND pg_get_constraintdef(oid) NOT LIKE '%officer%'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('student', 'admin', 'governor', 'cashier', 'officer'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_officer()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'governor', 'cashier', 'officer')
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp;
