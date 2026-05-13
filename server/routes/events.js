const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { sanitizeText, isPositiveNumber, isValidEnum, assertRequired } = require('../lib/validate');
const { logAudit } = require('../lib/audit');
const { sendNewEventEmail } = require('../lib/email');

const VALID_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

// GET /api/events
router.get('/', async (req, res) => {
  const [{ data: events, error: evtErr }, { data: transactions, error: txErr }] = await Promise.all([
    supabase.from('events').select('*').order('created_at', { ascending: false }),
    supabase.from('transactions').select('event_id, type, amount, use_allocation')
  ]);

  if (evtErr) return res.status(500).json({ error: 'Failed to fetch events.' });

  const txStats = {};
  if (transactions) {
    transactions.forEach(tx => {
      if (!txStats[tx.event_id]) txStats[tx.event_id] = { income: 0, expenses: 0, alloc_expenses: 0 };
      if (tx.type === 'expense') {
        txStats[tx.event_id].expenses += Number(tx.amount);
        if (tx.use_allocation) {
          txStats[tx.event_id].alloc_expenses += Number(tx.amount);
        }
      } else {
        txStats[tx.event_id].income += Number(tx.amount);
      }
    });
  }

  const enrichedEvents = events.map(ev => {
    const stats = txStats[ev.id] || { income: 0, expenses: 0, alloc_expenses: 0 };
    return {
      ...ev,
      computed_expenses: stats.expenses, // Total expenses (allocated + general)
      computed_income: stats.income,
      // Event remaining budget strictly enforces the initial allocation
      computed_remaining: Number(ev.allocated_budget) - stats.alloc_expenses
    };
  });

  res.json(enrichedEvents);
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const [{ data: event, error: evtErr }, { data: transactions, error: txErr }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      supabase.from('transactions').select('*').eq('event_id', id).order('created_at', { ascending: false })
    ]);

  if (evtErr) return res.status(404).json({ error: 'Event not found.' });
  if (txErr)  return res.status(500).json({ error: 'Failed to fetch transactions.' });

  let expenses = 0;
  let alloc_expenses = 0;
  let income = 0;
  if (transactions) {
    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        expenses += Number(tx.amount);
        if (tx.use_allocation) alloc_expenses += Number(tx.amount);
      } else {
        income += Number(tx.amount);
      }
    });
  }

  res.json({ 
    ...event, 
    computed_expenses: expenses,
    computed_income: income,
    computed_remaining: Number(event.allocated_budget) - alloc_expenses,
    transactions 
  });
});

// POST /api/events (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { event_name, description, allocated_budget, event_date, status } = req.body;

  // 1. Required fields
  const missing = assertRequired({ event_name, allocated_budget });
  if (missing) return res.status(400).json({ error: missing });

  // 2. Budget must be positive
  if (!isPositiveNumber(allocated_budget)) {
    return res.status(400).json({ error: 'Allocated budget must be a positive number.' });
  }

  // 3. Status enum
  const finalStatus = status || 'upcoming';
  if (!isValidEnum(finalStatus, VALID_STATUSES)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.` });
  }

  // 4. Sanitize text inputs
  const cleanName = sanitizeText(String(event_name));
  const cleanDesc = description ? sanitizeText(String(description)) : null;

  if (cleanName.length > 150) {
    return res.status(400).json({ error: 'Event name must be 150 characters or less.' });
  }
  if (cleanDesc && cleanDesc.length > 2000) {
    return res.status(400).json({ error: 'Description must be 2000 characters or less.' });
  }

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_name:       cleanName,
      description:      cleanDesc,
      allocated_budget: Number(allocated_budget),
      remaining_budget: Number(allocated_budget),
      event_date:       event_date || null,
      status:           finalStatus,
      created_by:       req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: 'Failed to create event.' });

  // 5. Automatic Allocation Transaction
  // This records the initial budget move in the ledger
  const { error: allocErr } = await supabase
    .from('transactions')
    .insert({
      event_id:         data.id,
      type:             'allocation',
      amount:           Number(allocated_budget),
      description:      `Initial Budget Allocation for ${cleanName}`,
      transaction_date: new Date().toISOString().split('T')[0],
      added_by:         req.user.id,
      use_allocation:   false // Allocations don't use allocation
    });

  if (allocErr) console.error('[Allocation] Failed to seed transaction:', allocErr.message);

  // Audit log
  logAudit(req.user.id, 'CREATE_EVENT', {
    event_id:         data.id,
    event_name:       cleanName,
    allocated_budget: Number(allocated_budget),
  });

  // Send email notifications to students in background
  sendNewEventEmail(data).catch(err =>
    console.error('[Email] Background send failed:', err.message)
  );

  res.status(201).json(data);
});

// PATCH /api/events/:id (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { id }    = req.params;
  const { event_name, description, allocated_budget, event_date, status } = req.body;

  // Build a clean updates object — only include provided fields
  const updates = {};

  if (event_name !== undefined) {
    updates.event_name = sanitizeText(String(event_name)).slice(0, 150);
  }
  if (description !== undefined) {
    updates.description = sanitizeText(String(description)).slice(0, 2000);
  }
  if (allocated_budget !== undefined) {
    if (!isPositiveNumber(allocated_budget)) {
      return res.status(400).json({ error: 'Allocated budget must be a positive number.' });
    }
    updates.allocated_budget = Number(allocated_budget);
  }
  if (status !== undefined) {
    if (!isValidEnum(status, VALID_STATUSES)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.` });
    }
    updates.status = status;
  }
  if (event_date !== undefined) {
    updates.event_date = event_date;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: 'Failed to update event.' });

  // Audit log
  logAudit(req.user.id, 'UPDATE_EVENT', { event_id: id, changes: Object.keys(updates) });

  res.json(data);
});

module.exports = router;
