const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { sanitizeText, isPositiveNumber, isValidEnum, isValidUUID, assertRequired } = require('../lib/validate');
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
// Students see all events except archived ones; admins also see archived
// (needed by the Manage Events tab for restore).
router.get('/', async (req, res) => {
  const isAdmin = req.profile?.role === 'admin';
  let eventsQuery = supabase.from('events').select('*').order('created_at', { ascending: false });
  if (!isAdmin) eventsQuery = eventsQuery.neq('status', 'archived');

  const [{ data: events, error: evtErr }, { data: transactions, error: txErr }] = await Promise.all([
    eventsQuery,
    supabase.from('transactions').select('event_id, type, amount, use_allocation')
  ]);

  if (evtErr) return res.status(500).json({ error: 'Failed to fetch events.' });

  const txStats = {};
  if (transactions) {
    transactions.forEach(tx => {
      if (!txStats[tx.event_id]) txStats[tx.event_id] = { income: 0, expenses: 0, alloc_expenses: 0, budget_injections: 0 };
      if (tx.type === 'expense') {
        txStats[tx.event_id].expenses += Number(tx.amount);
        if (tx.use_allocation) {
          txStats[tx.event_id].alloc_expenses += Number(tx.amount);
        }
      } else if (tx.type === 'allocation' || tx.type === 'transfer') {
        // Budget top-ups that increase the event's envelope
        txStats[tx.event_id].budget_injections += Number(tx.amount);
      } else {
        txStats[tx.event_id].income += Number(tx.amount);
      }
    });
  }

  const enrichedEvents = events.map(ev => {
    const stats = txStats[ev.id] || { income: 0, expenses: 0, alloc_expenses: 0, budget_injections: 0 };
    return {
      ...ev,
      computed_expenses: stats.expenses, // Total expenses (allocated + general)
      computed_income: stats.income,
      // Event remaining budget strictly enforces the initial allocation,
      // adjusted for transfers in and explicit budget allocations
      computed_remaining: Number(ev.allocated_budget) + stats.budget_injections - stats.alloc_expenses
    };
  });

  res.json(enrichedEvents);
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }

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
  let budget_injections = 0;
  if (transactions) {
    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        expenses += Number(tx.amount);
        if (tx.use_allocation) alloc_expenses += Number(tx.amount);
      } else if (tx.type === 'allocation' || tx.type === 'transfer') {
        budget_injections += Number(tx.amount);
      } else {
        income += Number(tx.amount);
      }
    });
  }

  // Receipts stored in the private 'receipts' bucket are signed per request
  // (1-hour expiry). Legacy http(s) links such as Google Drive pass through.
  const signedTransactions = await Promise.all((transactions || []).map(async tx => {
    if (tx.receipt_url && tx.receipt_url.startsWith('receipts/')) {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(tx.receipt_url.replace(/^receipts\//, ''), 3600);
      if (!error && data?.signedUrl) {
        return { ...tx, receipt_url: data.signedUrl };
      }
    }
    return tx;
  }));

  res.json({
    ...event,
    computed_expenses: expenses,
    computed_income: income,
    computed_remaining: Number(event.allocated_budget) + budget_injections - alloc_expenses,
    transactions: signedTransactions
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

  // 5. Automatic Allocation Transaction used to be here, removed for strict envelope accounting.

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

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }

  // Build a clean updates object - only include provided fields
  const updates = {};

  if (event_name !== undefined) {
    const cleanName = sanitizeText(String(event_name));
    if (!cleanName) {
      return res.status(400).json({ error: 'Event name cannot be empty.' });
    }
    if (cleanName.length > 150) {
      return res.status(400).json({ error: 'Event name must be 150 characters or less.' });
    }
    updates.event_name = cleanName;
  }
  if (description !== undefined) {
    const cleanDesc = sanitizeText(String(description));
    if (cleanDesc.length > 2000) {
      return res.status(400).json({ error: 'Description must be 2000 characters or less.' });
    }
    updates.description = cleanDesc || null;
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
    if (event_date !== null && event_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
      return res.status(400).json({ error: 'Event date must be a valid date (YYYY-MM-DD).' });
    }
    updates.event_date = event_date || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  // Keep remaining_budget coherent when the allocation changes: shift it by
  // the same delta so spent amounts and past transfers stay factored in.
  if (updates.allocated_budget !== undefined) {
    const { data: current, error: curErr } = await supabase
      .from('events')
      .select('allocated_budget, remaining_budget')
      .eq('id', id)
      .single();

    if (curErr || !current) return res.status(404).json({ error: 'Event not found.' });

    const delta = updates.allocated_budget - Number(current.allocated_budget);
    updates.remaining_budget = Number(current.remaining_budget) + delta;
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
