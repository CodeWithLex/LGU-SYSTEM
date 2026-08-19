-- =============================================
-- COE Budget Transparency System
-- Database Schema Migration v1.0
-- Run in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLE: profiles
-- Extends Supabase Auth users with role & COE info
-- =============================================
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  course     TEXT,
  year_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, course, year_level)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'COE Member'),
    'student', -- Hard-coded: role must never come from client-supplied metadata (privilege escalation)
    NEW.raw_user_meta_data->>'course',
    NEW.raw_user_meta_data->>'year_level'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================
-- TABLE: events
-- Represents any funded engineering event/activity
-- =============================================
CREATE TABLE public.events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name       TEXT NOT NULL,
  description      TEXT,
  allocated_budget NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  remaining_budget NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status           TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  event_date       DATE,
  created_by       UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- TABLE: transactions
-- Immutable ledger of all financial movements
-- =============================================
CREATE TABLE public.transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID REFERENCES public.events(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('expense', 'donation', 'collection', 'allocation')),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description   TEXT NOT NULL,
  donor_name    TEXT,       -- For donations only
  receipt_url   TEXT,       -- Supabase Storage URL
  added_by      UUID REFERENCES public.profiles(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- TABLE: receipts
-- Metadata for uploaded files in Supabase Storage
-- =============================================
CREATE TABLE public.receipts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_url       TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_type      TEXT NOT NULL,
  uploaded_by    UUID REFERENCES public.profiles(id),
  upload_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- TABLE: announcements
-- Admin-posted announcements visible to all students
-- =============================================
CREATE TABLE public.announcements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  posted_by  UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- TRIGGER: Auto-update event remaining_budget
-- Fires after every transaction INSERT
-- =============================================
CREATE OR REPLACE FUNCTION public.sync_event_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.events
  SET remaining_budget = (
    -- Sum allocations and income (donations, collections)
    COALESCE((
      SELECT SUM(amount) FROM public.transactions
      WHERE event_id = NEW.event_id AND type IN ('allocation', 'donation', 'collection')
    ), 0)
    -
    -- Subtract all expenses
    COALESCE((
      SELECT SUM(amount) FROM public.transactions
      WHERE event_id = NEW.event_id AND type = 'expense'
    ), 0)
  ),
  updated_at = NOW()
  WHERE id = NEW.event_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_transaction_inserted
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE PROCEDURE public.sync_event_balance();

-- =============================================
-- INDEXES for performance
-- =============================================
CREATE INDEX idx_transactions_event_id ON public.transactions(event_id);
CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_receipts_transaction_id ON public.receipts(transaction_id);

-- Enable Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
