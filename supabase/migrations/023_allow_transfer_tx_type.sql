-- =============================================
-- Migration 023: Allow 'transfer' transaction type and add direction
--
-- Note: This migration must be applied to staging first.
--
-- 1. Expands transactions_type_check to include 'transfer'
-- 2. Adds nullable 'direction' column ('in', 'out') for transfer movements
-- 3. Diagnostic review: flags events where allocated_budget exceeds
--    sum of allocation-type ledger rows (potential past unledgered increments)
-- =============================================

-- 1. Update check constraint on transaction types
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('expense', 'donation', 'collection', 'allocation', 'transfer'));

-- 2. Add direction column for transfers
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS direction TEXT
  CHECK (direction IN ('in', 'out'));

-- 3. Diagnostic review query:
-- Identify events where allocated_budget does not match ledger allocations
DO $$
DECLARE
  rec RECORD;
  flagged_count INT := 0;
BEGIN
  RAISE NOTICE '=== Migration 023: Budget Allocation Diagnostic Review ===';
  FOR rec IN
    SELECT
      e.id,
      e.event_name,
      e.allocated_budget,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'allocation'), 0) AS ledger_allocations,
      e.allocated_budget - COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'allocation'), 0) AS variance
    FROM public.events e
    LEFT JOIN public.transactions t ON t.event_id = e.id
    GROUP BY e.id, e.event_name, e.allocated_budget
    HAVING e.allocated_budget > COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'allocation'), 0)
  LOOP
    flagged_count := flagged_count + 1;
    RAISE NOTICE 'FLAGGED EVENT [ID: %, Name: "%"]: allocated_budget = %, ledger allocations = %, variance = %',
      rec.id, rec.event_name, rec.allocated_budget, rec.ledger_allocations, rec.variance;
  END LOOP;

  IF flagged_count = 0 THEN
    RAISE NOTICE 'All events match their ledger allocations. No discrepancies found.';
  ELSE
    RAISE NOTICE 'Total flagged events requiring manual review: %', flagged_count;
  END IF;
END $$;
