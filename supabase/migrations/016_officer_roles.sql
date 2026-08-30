-- =============================================
-- Migration: 016_officer_roles.sql
--
-- Introduces the officer roles 'governor' and 'cashier':
--   * widens profiles_role_check (re-runnable)
--   * adds the is_officer() helper (admin/governor/cashier)
--   * moves RLS write policies on money tables from is_admin() to
--     is_officer() as defense-in-depth (the server writes through the
--     service key, but direct authed writes stay correctly scoped)
--
-- Re-runnable: guarded constraint swap + CREATE OR REPLACE + DROP/CREATE
-- policies with stable names.
-- =============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
      AND pg_get_constraintdef(oid) NOT LIKE '%governor%'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('student', 'admin', 'governor', 'cashier'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_officer()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'governor', 'cashier')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- events: officers manage
DROP POLICY IF EXISTS "Only admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Officers can insert events" ON public.events;
CREATE POLICY "Officers can insert events"
  ON public.events FOR INSERT WITH CHECK (public.is_officer());

DROP POLICY IF EXISTS "Only admins can update events" ON public.events;
CREATE POLICY "Officers can update events"
  ON public.events FOR UPDATE USING (public.is_officer());

DROP POLICY IF EXISTS "Only admins can delete events" ON public.events;
CREATE POLICY "Only admins can delete events"
  ON public.events FOR DELETE USING (public.is_admin());

-- transactions: officers record (ledger stays immutable)
DROP POLICY IF EXISTS "Only admins can add transactions" ON public.transactions;
CREATE POLICY "Officers can add transactions"
  ON public.transactions FOR INSERT WITH CHECK (public.is_officer());

-- receipts: officers upload
DROP POLICY IF EXISTS "Only admins can upload receipts" ON public.receipts;
CREATE POLICY "Officers can upload receipts"
  ON public.receipts FOR INSERT WITH CHECK (public.is_officer());

-- announcements: officers post and update; delete stays admin-only
DROP POLICY IF EXISTS "Only admins can post announcements" ON public.announcements;
CREATE POLICY "Officers can post announcements"
  ON public.announcements FOR INSERT WITH CHECK (public.is_officer());

DROP POLICY IF EXISTS "Only admins can update announcements" ON public.announcements;
CREATE POLICY "Officers can update announcements"
  ON public.announcements FOR UPDATE USING (public.is_officer());

-- "Only admins can delete announcements" from 002_rls_policies.sql is kept
-- as-is: announcement deletion remains admin-only by design.
