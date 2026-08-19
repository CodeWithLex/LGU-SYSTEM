-- =============================================
-- Restrict Signups to School Gmail Domain
-- Blocks account creation for personal email accounts.
-- Applies to EVERY signup path (app form, direct API calls),
-- because it fires before any insert into auth.users.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste & run.
-- Existing accounts are NOT affected (fires only on new inserts).
-- =============================================

CREATE OR REPLACE FUNCTION public.enforce_school_email_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email NOT LIKE '%@g.cjc.edu.ph' THEN
    RAISE EXCEPTION 'Only @g.cjc.edu.ph school accounts are allowed to register.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_before_insert ON auth.users;
CREATE TRIGGER on_auth_user_before_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_school_email_domain();
