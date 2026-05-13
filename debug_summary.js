const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if(k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function debugSummary() {
  const [{ data: txs, error: txErr }, { data: events, error: evErr }] = await Promise.all([
    supabase.from('transactions').select('type, amount, use_allocation, event_id'),
    supabase.from('events').select('allocated_budget')
  ]);

  const summary = txs.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + Number(tx.amount);
    if (tx.type === 'expense' && !tx.use_allocation) {
      acc.dashboard_expense += Number(tx.amount);
    }
    return acc;
  }, { expense: 0, donation: 0, collection: 0, allocation: 0, transfer: 0, dashboard_expense: 0 });

  let totalReservedEnvelopes = 0;
  (events || []).forEach(e => {
     totalReservedEnvelopes += Number(e.allocated_budget);
  });

  const totalIncome  = summary.allocation + summary.donation + summary.collection;
  const totalExpense = summary.dashboard_expense;
  const remainingBalance = totalIncome - totalExpense - totalReservedEnvelopes;

  console.log('--- DEBUG SUMMARY ---');
  console.log('Total Income:', totalIncome);
  console.log('Total Expense:', totalExpense);
  console.log('Total Reserved:', totalReservedEnvelopes);
  console.log('Remaining Balance:', remainingBalance);
  console.log('Breakdown:', JSON.stringify(summary, null, 2));

  // Check generic donations count
  const genDonations = txs.filter(t => t.type === 'donation' && !t.event_id).reduce((s, t) => s + Number(t.amount), 0);
  console.log('General Donations:', genDonations);
}

debugSummary();
