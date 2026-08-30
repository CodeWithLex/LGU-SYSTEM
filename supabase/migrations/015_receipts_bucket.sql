-- =============================================
-- Migration: 015_receipts_bucket.sql
--
-- Creates the private 'receipts' storage bucket for in-system receipt
-- uploads (camera captures and file fallbacks). All access goes through
-- the server's service key behind auth middleware, so no storage RLS
-- policies are needed here.
--
-- Re-runnable: ON CONFLICT updates the config in place.
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  5242880, -- 5 MB hard cap per receipt
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public             = false,
    file_size_limit    = 5242880,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ];
