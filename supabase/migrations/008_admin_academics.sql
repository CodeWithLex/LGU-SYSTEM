-- =============================================
-- Migration: 008_admin_academics.sql
-- Admin Academic Management:
--  - subjects.is_archived: archive instead of delete
--  - student_units provenance: who last touched a record and when
-- Re-runnable: all adds are guarded.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE public.subjects
      ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_units' AND column_name = 'last_edited_by'
  ) THEN
    ALTER TABLE public.student_units
      ADD COLUMN last_edited_by TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_units' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.student_units
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
