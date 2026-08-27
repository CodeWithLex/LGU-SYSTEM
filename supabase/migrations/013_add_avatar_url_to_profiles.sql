-- =============================================
-- Migration: 013_add_avatar_url_to_profiles.sql
-- Description: Adds avatar_url column to public.profiles
-- =============================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Relative path or URL of the user selected avatar icon';
