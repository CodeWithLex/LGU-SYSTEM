// Applies 014_event_budget_trigger_fix.sql via the execute_sql RPC.
// The migration is re-runnable: CREATE OR REPLACE FUNCTION plus an
// idempotent full recomputation of remaining_budget.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('❌ Supabase credentials missing (SUPABASE_URL, SUPABASE_SERVICE_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const sqlPath = path.join(__dirname, '../supabase/migrations/014_event_budget_trigger_fix.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  console.log('🚀 Executing 014_event_budget_trigger_fix.sql via RPC execute_sql...');
  const { error } = await supabase.rpc('execute_sql', { sql: sqlContent });

  if (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }

  console.log('✅ Migration applied.');

  // Sanity check: the trigger function must now be delta-based (no full
  // recompute), and every event's remaining_budget must match the model
  // allocated + injections - allocated expenses.
  const verify = await supabase.rpc('execute_sql', {
    sql: `
      SELECT
        (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'sync_event_balance') AS fn_def,
        (SELECT count(*) FROM public.events e
         WHERE e.remaining_budget <> (
           e.allocated_budget
           + COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.event_id = e.id AND t.type IN ('allocation','transfer')), 0)
           - COALESCE((SELECT SUM(t.amount) FROM public.transactions t WHERE t.event_id = e.id AND t.type = 'expense' AND t.use_allocation), 0)
         )) AS inconsistent_events;
    `
  });

  if (verify.error) {
    console.error('⚠️  Could not run verification query:', verify.error.message);
    return;
  }

  const row = Array.isArray(verify.data) ? verify.data[0] : verify.data?.rows?.[0] ?? verify.data;
  const fnDef = typeof row?.fn_def === 'string' ? row.fn_def : JSON.stringify(row?.fn_def ?? '');
  const inconsistent = Number(row?.inconsistent_events ?? -1);

  console.log(fnDef.includes('remaining_budget - NEW.amount') && fnDef.includes("NEW.type = 'expense'")
    ? '✅ Trigger function is delta-based.'
    : '⚠️  Trigger function does not look delta-based - inspect manually.');
  console.log(inconsistent === 0
    ? '✅ All events recalibrated: remaining_budget matches allocated + injections - allocated expenses.'
    : `⚠️  ${inconsistent} event(s) still inconsistent with the target model.`);
}

run().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
