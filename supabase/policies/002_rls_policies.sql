-- =============================================
-- Row Level Security (RLS) Policies
-- COE Budget Transparency System
-- Apply AFTER running 001_initial_schema.sql
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================
-- POLICIES: profiles
-- =============================================
-- Anyone authenticated can view profiles
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());

-- =============================================
-- POLICIES: events
-- =============================================
-- All authenticated users can view events
CREATE POLICY "Events viewable by all"
  ON public.events FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete events
CREATE POLICY "Only admins can manage events"
  ON public.events FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update events"
  ON public.events FOR UPDATE USING (public.is_admin());

CREATE POLICY "Only admins can delete events"
  ON public.events FOR DELETE USING (public.is_admin());

-- =============================================
-- POLICIES: transactions
-- =============================================
CREATE POLICY "Transactions viewable by all"
  ON public.transactions FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can add transactions"
  ON public.transactions FOR INSERT WITH CHECK (public.is_admin());

-- Transactions are immutable — no updates or deletes (audit trail)
-- Admins may soft-delete via a status column (future enhancement)

-- =============================================
-- POLICIES: receipts
-- =============================================
CREATE POLICY "Receipts viewable by all"
  ON public.receipts FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can upload receipts"
  ON public.receipts FOR INSERT WITH CHECK (public.is_admin());

-- =============================================
-- POLICIES: announcements
-- =============================================
CREATE POLICY "Announcements viewable by all"
  ON public.announcements FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can post announcements"
  ON public.announcements FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update announcements"
  ON public.announcements FOR UPDATE USING (public.is_admin());

CREATE POLICY "Only admins can delete announcements"
  ON public.announcements FOR DELETE USING (public.is_admin());
