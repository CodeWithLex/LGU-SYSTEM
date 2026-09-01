-- =============================================
-- 020_add_funding_source_to_events.sql
-- Add funding_source column to public.events
-- =============================================

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT 'General Fund';

UPDATE public.events 
SET funding_source = 'General Fund' 
WHERE funding_source IS NULL OR funding_source = '';
