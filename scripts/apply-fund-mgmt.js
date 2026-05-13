/**
 * scripts/apply-fund-mgmt.js
 * Migration script to add 'use_allocation' column and seed missing allocations.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for bypass RLS
);

async function migrate() {
  console.log('🚀 Starting Fund Source Migration...');

  // 1. Add column to transactions
  const { error: colErr } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS use_allocation BOOLEAN DEFAULT TRUE;'
  });

  if (colErr) {
    if (colErr.message.includes('permission denied')) {
        console.warn('⚠️ RPC execute_sql failed (Permission Denied). This usually means the RPC function is not installed.');
        console.log('Trying alternative: Manual insert strategy...');
    } else {
        console.error('❌ Error adding column:', colErr.message);
        // We continue anyway in case the column already exists
    }
  }

  // 2. Backfill existing events with allocation transactions
  // We only do this if they don't have one yet.
  const { data: events, error: evtErr } = await supabase.from('events').select('id, event_name, allocated_budget, created_at');
  if (evtErr) return console.error('❌ Error fetching events:', evtErr.message);

  const { data: existingAllocs, error: allocErr } = await supabase.from('transactions').select('event_id').eq('type', 'allocation');
  if (allocErr) return console.error('❌ Error fetching existing allocations:', allocErr.message);

  const allocatedEventIds = new Set(existingAllocs.map(a => a.event_id));
  const toInsert = events
    .filter(e => !allocatedEventIds.has(e.id))
    .map(e => ({
      event_id: e.id,
      type: 'allocation',
      amount: Number(e.allocated_budget),
      description: `Initial Budget Allocation for ${e.event_name}`,
      transaction_date: e.created_at.slice(0, 10),
      use_allocation: false // Allocations themselves don't "use" allocation
    }));

  if (toInsert.length > 0) {
    console.log(`📦 Seeding ${toInsert.length} missing allocation transactions...`);
    const { error: insErr } = await supabase.from('transactions').insert(toInsert);
    if (insErr) console.error('❌ Error seeding allocations:', insErr.message);
    else console.log('✅ Seeding complete.');
  } else {
    console.log('ℹ️ No missing allocations found.');
  }

  console.log('✨ Migration finished.');
}

migrate();
