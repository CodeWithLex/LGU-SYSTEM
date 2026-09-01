-- =============================================
-- Migration 019: Realtime Notification System Schema
-- =============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL means broadcast to role
  target_role TEXT NOT NULL DEFAULT 'all' CHECK (target_role IN ('all', 'student', 'officer', 'admin')),
  type        TEXT NOT NULL CHECK (type IN ('announcement', 'event', 'transaction', 'units', 'system')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('events', 'transactions', 'reports', 'announcements', 'units', 'system')),
  link        TEXT, -- Optional tab/view link (e.g., 'events', 'transactions', 'reports', 'units')
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual read tracking for broadcast and targeted notifications
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notification_user_read UNIQUE (notification_id, user_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON public.notifications(target_role);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON public.notification_reads(user_id);

-- Enable Realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
