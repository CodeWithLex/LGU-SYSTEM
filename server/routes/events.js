const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');

// Admin-only guard
function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

// GET /api/events — list all events
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/events/:id — single event with transactions
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const [{ data: event, error: evtErr }, { data: transactions, error: txErr }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      supabase.from('transactions').select('*').eq('event_id', id).order('created_at', { ascending: false })
    ]);

  if (evtErr) return res.status(404).json({ error: 'Event not found.' });
  if (txErr)  return res.status(500).json({ error: txErr.message });

  res.json({ ...event, transactions });
});

// POST /api/events — create event (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { event_name, description, allocated_budget, event_date, status } = req.body;

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_name,
      description,
      allocated_budget: Number(allocated_budget),
      remaining_budget: Number(allocated_budget),
      event_date,
      status: status || 'upcoming',
      created_by: req.user.id
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/events/:id — update event (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const { data, error } = await supabase
    .from('events')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
