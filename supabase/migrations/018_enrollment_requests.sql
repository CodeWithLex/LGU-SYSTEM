-- Migration 018: Student Enrollment Verification Requests Table & RLS

CREATE TABLE IF NOT EXISTS public.enrollment_verification_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  course TEXT NOT NULL,
  year_level TEXT NOT NULL,
  enrollment_year INT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quick filtering and lookup
CREATE INDEX IF NOT EXISTS idx_roster_requests_user ON public.enrollment_verification_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_roster_requests_status ON public.enrollment_verification_requests (status);
CREATE INDEX IF NOT EXISTS idx_roster_requests_created ON public.enrollment_verification_requests (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.enrollment_verification_requests ENABLE ROW LEVEL SECURITY;

-- 1. Students can view their own requests
DROP POLICY IF EXISTS "Students can view own verification requests" ON public.enrollment_verification_requests;
CREATE POLICY "Students can view own verification requests" ON public.enrollment_verification_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Students can insert their own verification request
DROP POLICY IF EXISTS "Students can submit own verification request" ON public.enrollment_verification_requests;
CREATE POLICY "Students can submit own verification request" ON public.enrollment_verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. Officers and Admins can view and manage all verification requests
DROP POLICY IF EXISTS "Officers can manage all verification requests" ON public.enrollment_verification_requests;
CREATE POLICY "Officers can manage all verification requests" ON public.enrollment_verification_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'governor', 'cashier')
    )
  );
