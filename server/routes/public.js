// =============================================
// server/routes/public.js - Public Transparency Routes
//
// Read-only, unauthenticated public views of financial summaries and
// events. Gated behind the PUBLIC_TRANSPARENCY_MODE feature flag.
// Conservative field set: only aggregates and sanitized transaction
// metadata (type, amount, date, description). No donor names, no
// user IDs, no receipt URLs.
// =============================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { logError } = require('../lib/logger');

// Middleware to check feature flag
function requirePublicMode(req, res, next) {
  if (process.env.PUBLIC_TRANSPARENCY_MODE !== 'true') {
    return res.status(403).json({ error: 'Public transparency mode is not enabled.' });
  }
  next();
}

// GET /api/public/status - Check if public viewer mode is enabled
router.get('/status', (req, res) => {
  res.json({ enabled: process.env.PUBLIC_TRANSPARENCY_MODE === 'true' });
});

// GET /api/public/summary - Sanitized overall financial aggregates
router.get('/summary', requirePublicMode, async (req, res) => {
  try {
    const [{ data: txs, error: txErr }, { data: events, error: evErr }] = await Promise.all([
      supabase.from('transactions').select('event_id, type, amount, use_allocation, direction'),
      supabase.from('events').select('id, allocated_budget')
    ]);

    if (txErr || evErr) {
      logError('Public Summary Error', txErr || evErr);
      return res.status(500).json({ error: 'Failed to fetch public summary.' });
    }

    const eventStats = {};
    const summary = (txs || []).reduce((acc, tx) => {
      acc[tx.type] = (acc[tx.type] || 0) + Number(tx.amount);
      if (tx.type === 'expense') {
        acc.total_system_expense += Number(tx.amount);
        if (!tx.use_allocation) acc.dashboard_expense += Number(tx.amount);
      }

      if (tx.event_id) {
        if (!eventStats[tx.event_id]) {
          eventStats[tx.event_id] = { allocExpenses: 0, transfersIn: 0, transfersOut: 0 };
        }
        if (tx.type === 'expense' && tx.use_allocation) {
          eventStats[tx.event_id].allocExpenses += Number(tx.amount);
        } else if (tx.type === 'transfer') {
          if (tx.direction === 'in') eventStats[tx.event_id].transfersIn += Number(tx.amount);
          else if (tx.direction === 'out') eventStats[tx.event_id].transfersOut += Number(tx.amount);
        } else if (tx.type === 'allocation') {
          eventStats[tx.event_id].transfersIn += Number(tx.amount);
        }
      }
      return acc;
    }, { expense: 0, donation: 0, collection: 0, allocation: 0, transfer: 0, dashboard_expense: 0, total_system_expense: 0 });

    let totalReservedEnvelopes = 0;
    let totalEnvelopeDeficits = 0;

    (events || []).forEach(e => {
      const allocated = Number(e.allocated_budget) || 0;
      totalReservedEnvelopes += allocated;
      const stats = eventStats[e.id] || { allocExpenses: 0, transfersIn: 0, transfersOut: 0 };
      const effectiveEnvelope = allocated + stats.transfersIn - stats.transfersOut;
      const deficit = Math.max(0, stats.allocExpenses - effectiveEnvelope);
      totalEnvelopeDeficits += deficit;
    });

    const totalIncome  = summary.allocation + summary.donation + summary.collection;
    const totalExpense = summary.total_system_expense;
    const generalExpense = summary.dashboard_expense;
    const remainingBalance = totalIncome - generalExpense - totalReservedEnvelopes - totalEnvelopeDeficits;
    const netCashBalance = totalIncome - totalExpense;

    res.json({
      totalIncome,
      totalExpense,
      netCashBalance,
      remainingBalance,
      totalEnvelopeDeficits,
      breakdown: {
        donation: summary.donation,
        collection: summary.collection,
        allocation: summary.allocation,
        general_expense: generalExpense,
        reserved_envelopes: totalReservedEnvelopes,
        envelope_deficits: totalEnvelopeDeficits
      }
    });
  } catch (err) {
    logError('Public Summary Exception', err);
    res.status(500).json({ error: 'Failed to fetch public summary.' });
  }
});

// GET /api/public/events - Sanitized event list and anonymized transaction totals
router.get('/events', requirePublicMode, async (req, res) => {
  try {
    const [{ data: events, error: evtErr }, { data: transactions, error: txErr }] = await Promise.all([
      supabase.from('events').select('id, event_name, description, event_date, status, allocated_budget, funding_source').neq('status', 'archived').order('created_at', { ascending: false }),
      supabase.from('transactions').select('event_id, type, amount, use_allocation, direction, transaction_date')
    ]);

    if (evtErr || txErr) {
      logError('Public Events Error', evtErr || txErr);
      return res.status(500).json({ error: 'Failed to fetch public events.' });
    }

    const txStats = {};
    (transactions || []).forEach(tx => {
      if (!tx.event_id) return;
      if (!txStats[tx.event_id]) txStats[tx.event_id] = { expenses: 0, alloc_expenses: 0, transfers_in: 0, transfers_out: 0 };
      if (tx.type === 'expense') {
        txStats[tx.event_id].expenses += Number(tx.amount);
        if (tx.use_allocation) txStats[tx.event_id].alloc_expenses += Number(tx.amount);
      } else if (tx.type === 'transfer') {
        if (tx.direction === 'in') txStats[tx.event_id].transfers_in += Number(tx.amount);
        else if (tx.direction === 'out') txStats[tx.event_id].transfers_out += Number(tx.amount);
      } else if (tx.type === 'allocation') {
        txStats[tx.event_id].transfers_in += Number(tx.amount);
      }
    });

    const publicEvents = (events || []).map(ev => {
      const stats = txStats[ev.id] || { expenses: 0, alloc_expenses: 0, transfers_in: 0, transfers_out: 0 };
      const budget = Number(ev.allocated_budget) || 0;
      const remaining = budget + stats.transfers_in - stats.transfers_out - stats.alloc_expenses;

      return {
        id: ev.id,
        event_name: ev.event_name,
        description: ev.description,
        event_date: ev.event_date,
        status: ev.status,
        funding_source: ev.funding_source || 'General Fund',
        allocated_budget: budget,
        computed_expenses: stats.expenses,
        computed_remaining: remaining
      };
    });

    res.json(publicEvents);
  } catch (err) {
    logError('Public Events Exception', err);
    res.status(500).json({ error: 'Failed to fetch public events.' });
  }
});

module.exports = router;
