// Read-only sanity check for migration 014 readiness.
// Reports: current trigger shape, and per-event drift between the stored
// remaining_budget column and the target model (allocated + injections -
// allocated expenses) that the migration will recalibrate.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key);

async function run() {
  const { data: events, error: eErr } = await supabase
    .from('events')
    .select('id, event_name, allocated_budget, remaining_budget, status');
  if (eErr) { console.error('❌', eErr.message); process.exit(1); }

  const { data: txs, error: tErr } = await supabase
    .from('transactions')
    .select('event_id, type, amount, use_allocation');
  if (tErr) { console.error('❌', tErr.message); process.exit(1); }

  const stats = {};
  txs.forEach(t => {
    if (!stats[t.event_id]) stats[t.event_id] = { inj: 0, allocExp: 0 };
    if (t.type === 'allocation' || t.type === 'transfer') stats[t.event_id].inj += Number(t.amount);
    if (t.type === 'expense' && t.use_allocation) stats[t.event_id].allocExp += Number(t.amount);
  });

  console.log(`events: ${events.length}, transactions: ${txs.length}\n`);
  let drifted = 0;
  events.forEach(ev => {
    const s = stats[ev.id] || { inj: 0, allocExp: 0 };
    const target = Number(ev.allocated_budget) + s.inj - s.allocExp;
    const drift = Number(ev.remaining_budget) - target;
    const flag = Math.abs(drift) > 0.005 ? ' ⚠️ DRIFT' : '';
    if (flag) drifted++;
    console.log(
      `${ev.event_name} [${ev.status}] alloc=${ev.allocated_budget} col=${ev.remaining_budget} target=${target.toFixed(2)}${flag}`
    );
  });
  console.log(`\n${drifted} event(s) would be corrected by migration 014's recalibration.`);
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
