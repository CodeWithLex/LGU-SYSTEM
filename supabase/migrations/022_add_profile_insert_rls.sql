-- Migration: 022_add_profile_insert_rls.sql
-- Description: Adds RLS INSERT policy to public.profiles so authenticated users can insert/upsert their own profile row if missing

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
  CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (id = (SELECT auth.uid()));
END $$;
