-- =============================================
-- Migration: 014_event_budget_trigger_fix.sql
--
-- The sync_event_balance() trigger from 001_initial_schema.sql recomputes
-- remaining_budget from scratch on every transaction insert as
-- (allocation + donation + collection) - ALL expenses. That conflicts with
-- how the rest of the system treats the column:
--   * Event creation seeds remaining_budget = allocated_budget (no
--     allocation transaction is inserted anymore), so the trigger's formula
--     ignores the seed and clobbers it on the first transaction.
--   * Budget transfers adjust remaining_budget directly (type 'transfer'
--     transactions on the target event), and the trigger wipes those
--     adjustments on the next insert.
--   * Expenses marked use_allocation = false draw from the general fund,
--     but the trigger subtracted them from the event envelope too.
--
-- New model (matches GET /api/events computed_remaining):
--   remaining_budget = allocated_budget
--                    + budget injections (type 'allocation' or 'transfer')
--                    - allocated expenses (type 'expense' AND use_allocation)
-- The trigger therefore applies only the DELTA of each inserted row.
-- Donations and collections are tracked as income, not as envelope balance.
--
-- Re-runnable: CREATE OR REPLACE + a full recomputation of the column.
-- =============================================

-- 1. Recalibrate the column to the target model before swapping semantics.
UPDATE public.events e
SET remaining_budget =
    e.allocated_budget
    + COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.event_id = e.id AND t.type IN ('allocation', 'transfer')
      ), 0)
    - COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.event_id = e.id AND t.type = 'expense' AND t.use_allocation
      ), 0);

-- 2. Replace the absolute recompute with a delta update.
CREATE OR REPLACE FUNCTION public.sync_event_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'expense' AND NEW.use_allocation THEN
    UPDATE public.events
    SET remaining_budget = remaining_budget - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.event_id;
  ELSIF NEW.type = 'allocation' THEN
    UPDATE public.events
    SET remaining_budget = remaining_budget + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.event_id;
  END IF;
  -- 'transfer' rows are handled by the transfer endpoint (it adjusts both
  -- source and target directly), donations/collections are income only.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure the trigger exists and points at the replaced function.
DROP TRIGGER IF EXISTS on_transaction_inserted ON public.transactions;
CREATE TRIGGER on_transaction_inserted
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE PROCEDURE public.sync_event_balance();
