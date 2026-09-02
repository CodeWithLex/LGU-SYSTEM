-- =============================================
-- Migration: 024_event_balance_trigger_recompute.sql
--
-- Note: This migration must be applied to staging first.
--
-- Replaces the INSERT-only delta trigger from migration 014 with an idempotent,
-- full-ledger recompute trigger on INSERT OR UPDATE OR DELETE.
--
-- Formula (ledger single source of truth):
--   remaining_budget = allocated_budget
--                    + SUM(transfers in + legacy allocations)
--                    - SUM(transfers out)
--                    - SUM(expenses where use_allocation = true)
--
-- Re-runnable: CREATE OR REPLACE FUNCTION + recalibration UPDATE.
-- =============================================

-- 1. Helper function: recomputes a single event's remaining_budget from scratch
CREATE OR REPLACE FUNCTION public.recompute_event_balance(target_event_id UUID)
RETURNS VOID AS $$
BEGIN
  IF target_event_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.events e
  SET remaining_budget =
      e.allocated_budget
      + COALESCE((
          SELECT SUM(t.amount) FROM public.transactions t
          WHERE t.event_id = e.id
            AND ((t.type = 'transfer' AND t.direction = 'in') OR t.type = 'allocation')
        ), 0)
      - COALESCE((
          SELECT SUM(t.amount) FROM public.transactions t
          WHERE t.event_id = e.id
            AND (t.type = 'transfer' AND t.direction = 'out')
        ), 0)
      - COALESCE((
          SELECT SUM(t.amount) FROM public.transactions t
          WHERE t.event_id = e.id
            AND t.type = 'expense'
            AND t.use_allocation = true
        ), 0),
      updated_at = NOW()
  WHERE e.id = target_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger function: dispatches recompute on INSERT, UPDATE, or DELETE
CREATE OR REPLACE FUNCTION public.sync_event_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.event_id IS NOT NULL THEN
      PERFORM public.recompute_event_balance(NEW.event_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If event_id changed, recompute the old event envelope as well
    IF OLD.event_id IS NOT NULL AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
      PERFORM public.recompute_event_balance(OLD.event_id);
    END IF;
    IF NEW.event_id IS NOT NULL THEN
      PERFORM public.recompute_event_balance(NEW.event_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.event_id IS NOT NULL THEN
      PERFORM public.recompute_event_balance(OLD.event_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace the old INSERT-only trigger with the full lifecycle trigger
DROP TRIGGER IF EXISTS on_transaction_inserted ON public.transactions;
DROP TRIGGER IF EXISTS on_transaction_balance_sync ON public.transactions;

CREATE TRIGGER on_transaction_balance_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE PROCEDURE public.sync_event_balance();

-- 4. Recalibrate remaining_budget for all events using the full recomputation
UPDATE public.events e
SET remaining_budget =
    e.allocated_budget
    + COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.event_id = e.id
          AND ((t.type = 'transfer' AND t.direction = 'in') OR t.type = 'allocation')
      ), 0)
    - COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.event_id = e.id
          AND (t.type = 'transfer' AND t.direction = 'out')
      ), 0)
    - COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.event_id = e.id
          AND t.type = 'expense'
          AND t.use_allocation = true
      ), 0),
    updated_at = NOW();
