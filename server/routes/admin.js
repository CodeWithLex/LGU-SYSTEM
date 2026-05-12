// =============================================
// server/routes/admin.js — Admin-Only Operations
// =============================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { isPositiveNumber, isValidEnum, sanitizeText } = require('../lib/validate');
const { logAudit } = require('../lib/audit');

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}
router.use(requireAdmin);

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, course, year_level, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch users.' });
  res.json(data);
});

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!isValidEnum(role, ['admin', 'student'])) {
    return res.status(400).json({ error: 'Role must be "admin" or "student".' });
  }

  // Prevent self-demotion
  if (id === req.user.id && role === 'student') {
    return res.status(400).json({ error: 'You cannot demote yourself.' });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id)
    .select('id, full_name, role')
    .single();

  if (error) return res.status(400).json({ error: 'Failed to update role.' });

  logAudit(req.user.id, 'SET_USER_ROLE', { target_user_id: id, new_role: role });
  res.json(data);
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  const limit  = Math.min(Number(req.query.limit)  || 50, 100);
  const offset = Math.min(Number(req.query.offset) || 0, 10000);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, profiles!user_id(full_name, email)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: 'Failed to fetch audit logs.' });
  res.json(data);
});

// ── POST /api/admin/budget-transfer ──────────────────────────────────────────
router.post('/budget-transfer', async (req, res) => {
  const { from_event_id, to_event_id, amount, reason } = req.body;

  if (!from_event_id || !to_event_id) {
    return res.status(400).json({ error: 'Both source and target events are required.' });
  }
  if (from_event_id === to_event_id) {
    return res.status(400).json({ error: 'Source and target events must be different.' });
  }
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }
  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
  }

  const transferAmount = Number(amount);

  // Fetch both events
  const [{ data: fromEv, error: fe }, { data: toEv, error: te }] = await Promise.all([
    supabase.from('events').select('id, event_name, remaining_budget, status').eq('id', from_event_id).single(),
    supabase.from('events').select('id, event_name, remaining_budget, status').eq('id', to_event_id).single(),
  ]);

  if (fe || !fromEv) return res.status(404).json({ error: 'Source event not found.' });
  if (te || !toEv)   return res.status(404).json({ error: 'Target event not found.' });

  if (fromEv.status === 'archived') {
    return res.status(400).json({ error: 'Cannot transfer from an archived event.' });
  }
  if (Number(fromEv.remaining_budget) < transferAmount) {
    return res.status(400).json({ error: `Insufficient remaining budget in "${fromEv.event_name}". Available: ₱${Number(fromEv.remaining_budget).toLocaleString()}.` });
  }

  // Deduct from source, add to target
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('events').update({ remaining_budget: Number(fromEv.remaining_budget) - transferAmount }).eq('id', from_event_id),
    supabase.from('events').update({
      remaining_budget: Number(toEv.remaining_budget) + transferAmount,
      allocated_budget: supabase.rpc ? undefined : undefined, // keep allocated the same
    }).eq('id', to_event_id),
  ]);

  if (e1 || e2) return res.status(500).json({ error: 'Transfer failed. Please try again.' });

  // Record as allocation transaction on the target event
  await supabase.from('transactions').insert({
    event_id:         to_event_id,
    type:             'allocation',
    amount:           transferAmount,
    description:      `Budget transfer from "${fromEv.event_name}": ${sanitizeText(reason)}`,
    added_by:         req.user.id,
    transaction_date: new Date().toISOString().split('T')[0],
  });

  logAudit(req.user.id, 'BUDGET_TRANSFER', {
    from_event_id,
    to_event_id,
    amount: transferAmount,
    reason: sanitizeText(reason),
  });

  res.json({
    message: `Successfully transferred ₱${transferAmount.toLocaleString()} from "${fromEv.event_name}" to "${toEv.event_name}".`
  });
});

// ── PATCH /api/admin/events/:id/archive ──────────────────────────────────────
router.patch('/events/:id/archive', async (req, res) => {
  const { id } = req.params;

  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('id, event_name, status')
    .eq('id', id)
    .single();

  if (evErr || !ev) return res.status(404).json({ error: 'Event not found.' });
  if (ev.status === 'archived') return res.status(400).json({ error: 'Event is already archived.' });

  const { data, error } = await supabase
    .from('events')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: 'Failed to archive event.' });

  logAudit(req.user.id, 'ARCHIVE_EVENT', { event_id: id, event_name: ev.event_name });
  res.json(data);
});

module.exports = router;
