require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testSummary() {
  const { data, error } = await supabase.from('transactions').select('type, amount, use_allocation');
  if (error) return console.error('❌ Error:', error.message);

  const summary = data.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + Number(tx.amount);
    if (tx.type === 'allocation' || (tx.type === 'expense' && !tx.use_allocation)) {
      acc.dashboard_expense += Number(tx.amount);
    }
    return acc;
  }, { expense: 0, donation: 0, collection: 0, allocation: 0, dashboard_expense: 0 });

  const totalIncome = summary.donation + summary.collection;
  const totalExpense = summary.dashboard_expense;
  
  console.log('--- DASHBOARD TEST ---');
  console.log('Total Income:', totalIncome);
  console.log('Total Expense (Allocations + General):', totalExpense);
  console.log('Remaining Balance:', totalIncome - totalExpense);
}

testSummary();
