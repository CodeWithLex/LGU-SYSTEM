const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');

// GET /api/reports/summary — Global financial summary
router.get('/summary', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount');

  if (error) return res.status(500).json({ error: error.message });

  const summary = data.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + Number(tx.amount);
    return acc;
  }, { expense: 0, donation: 0, collection: 0, allocation: 0 });

  const totalIncome  = summary.allocation + summary.donation + summary.collection;
  const totalExpense = summary.expense;

  res.json({
    totalIncome,
    totalExpense,
    remainingBalance: totalIncome - totalExpense,
    breakdown: summary
  });
});

// GET /api/reports/monthly — Monthly income vs expense summary
router.get('/monthly', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, transaction_date')
    .order('transaction_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const monthly = {};
  data.forEach(tx => {
    const month = tx.transaction_date.slice(0, 7); // "YYYY-MM"
    if (!monthly[month]) monthly[month] = { income: 0, expense: 0 };

    if (tx.type === 'expense') {
      monthly[month].expense += Number(tx.amount);
    } else {
      monthly[month].income += Number(tx.amount);
    }
  });

  const result = Object.entries(monthly).map(([month, data]) => ({
    month,
    income:    data.income,
    expense:   data.expense,
    remaining: data.income - data.expense
  }));

  res.json(result);
});

module.exports = router;
