-- =============================================
-- Migration: 009_events_archived_status.sql
-- The events.status CHECK constraint from 001_initial_schema.sql omits
-- 'archived', but PATCH /api/admin/events/:id/archive sets exactly that
-- value (verified failing against the live DB). Drop and re-add the
-- constraint with 'archived' included.
--
-- Re-runnable: the drop/re-add only runs when the existing constraint
-- lacks 'archived'.
-- =============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_status_check'
      AND conrelid = 'public.events'::regclass
      AND pg_get_constraintdef(oid) NOT LIKE '%archived%'
  ) THEN
    ALTER TABLE public.events DROP CONSTRAINT events_status_check;
    ALTER TABLE public.events ADD CONSTRAINT events_status_check
      CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled', 'archived'));
  END IF;
END $$;
