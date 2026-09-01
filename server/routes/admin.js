// =============================================
// server/routes/admin.js - Admin-Only Operations
// =============================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { isPositiveNumber, isValidEnum, isValidUUID, sanitizeText } = require('../lib/validate');
const { logAudit } = require('../lib/audit');
const { logError } = require('../lib/logger');
const { requireAdmin, requireOfficer } = require('../middleware/roles');
const { createNotification } = require('./notifications');

const ASSIGNABLE_ROLES = ['admin', 'student', 'governor', 'cashier'];
const OFFICER_ASSIGNABLE_ROLES = ['student', 'governor', 'cashier'];

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', requireOfficer, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, course, year_level, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch users.' });
  res.json(data);
});

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
// Admins may assign any role; governors may assign officer/student roles but
// never touch admin accounts; cashiers have no role-assignment power.
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const actorRole = req.profile?.role;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }
  if (!isValidEnum(role, ASSIGNABLE_ROLES)) {
    return res.status(400).json({ error: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.` });
  }
  if (actorRole === 'cashier') {
    return res.status(403).json({ error: 'Cashiers cannot assign roles.' });
  }
  if (actorRole === 'governor') {
    if (!OFFICER_ASSIGNABLE_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Only admins can assign the admin role.' });
    }
    const { data: target } = await supabase.from('profiles').select('role').eq('id', id).single();
    if (target?.role === 'admin') {
      return res.status(403).json({ error: 'Governors cannot modify admin accounts.' });
    }
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

  logAudit(req.user.id, 'SET_USER_ROLE', {
    target_user_id: id,
    user_name: data.full_name,
    new_role: role,
    changed_by_role: actorRole
  });

  // Targeted notification for the user whose role was updated
  createNotification({
    userId: id,
    targetRole: 'all',
    type: 'system',
    title: `🎓 Account Status Updated`,
    message: `Your account role has been set to ${role.toUpperCase()}.`,
    category: 'units',
    link: 'units',
    metadata: { new_role: role }
  });

  res.json(data);
});

// ── GET /api/admin/audit-logs (readable by all officers) ─────────────────────
router.get('/audit-logs', requireOfficer, async (req, res) => {
  const limit  = Math.min(Number(req.query.limit)  || 50, 100);
  const offset = Math.min(Number(req.query.offset) || 0, 10000);

  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logError('Audit Log Error', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }

  // Manual join for profiles to bypass missing FK relationships
  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
  
  // Collect detailed enrichment IDs
  const targetUserIds = [...new Set(logs.map(l => l.details?.target_user_id).filter(Boolean))];
  const allProfileIds = [...new Set([...userIds, ...targetUserIds])];

  const eventIds = [...new Set(logs.flatMap(l => {
    const d = l.details || {};
    return [d.event_id, d.from_event_id, d.to_event_id].filter(Boolean);
  }))];

  let profilesMap = {};
  let eventsMap = {};

  const fetches = [];
  if (allProfileIds.length > 0) {
    fetches.push(supabase.from('profiles').select('id, full_name, email').in('id', allProfileIds).then(({ data }) => {
      if (data) data.forEach(p => profilesMap[p.id] = p);
    }));
  }
  if (eventIds.length > 0) {
    fetches.push(supabase.from('events').select('id, event_name').in('id', eventIds).then(({ data }) => {
      if (data) data.forEach(e => eventsMap[e.id] = e.event_name);
    }));
  }

  await Promise.all(fetches);

  const mergedData = logs.map(log => {
    const d = { ...(log.details || {}) };
    
    // Inject names if missing but ID exists
    if (d.event_id && !d.event_name) d.event_name = eventsMap[d.event_id];
    if (d.from_event_id && !d.from_event_name) d.from_event_name = eventsMap[d.from_event_id];
    if (d.to_event_id && !d.to_event_name) d.to_event_name = eventsMap[d.to_event_id];
    if (d.target_user_id && !d.user_name) d.user_name = profilesMap[d.target_user_id]?.full_name;

    return {
      ...log,
      profiles: profilesMap[log.user_id] || null,
      details: d
    };
  });

  res.json(mergedData);
});

// ── POST /api/admin/budget-transfer ──────────────────────────────────────────
router.post('/budget-transfer', requireOfficer, async (req, res) => {
  const { from_event_id, to_event_id, amount, reason } = req.body;

  if (!from_event_id || !to_event_id) {
    return res.status(400).json({ error: 'Both source and target events are required.' });
  }
  if (from_event_id === to_event_id) {
    return res.status(400).json({ error: 'Source and target events must be different.' });
  }
  if (!isValidUUID(to_event_id)) {
    return res.status(400).json({ error: 'Target event must be a valid event ID.' });
  }
  if (from_event_id !== 'GENERAL' && !isValidUUID(from_event_id)) {
    return res.status(400).json({ error: 'Source event must be a valid event ID or General Fund.' });
  }
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }
  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ error: 'A reason of at least 5 characters is required.' });
  }

  const transferAmount = Number(amount);

  let fromEventName = "General Fund";
  let toEventName   = "";

  // ── CASE 1: Transfer from General Fund ──────────────────────────────
  if (from_event_id === 'GENERAL') {
    const [{ data: txs, error: txErr }, { data: events, error: evErr }, { data: targetEv, error: te }] = await Promise.all([
      supabase.from('transactions').select('type, amount, use_allocation'),
      supabase.from('events').select('allocated_budget'),
      supabase.from('events').select('id, event_name, allocated_budget, remaining_budget, status').eq('id', to_event_id).single(),
    ]);

    if (txErr || evErr) return res.status(500).json({ error: 'Failed to compute general fund balance.' });
    if (te || !targetEv) return res.status(404).json({ error: 'Target event not found.' });
    if (targetEv.status === 'archived') return res.status(400).json({ error: 'Cannot transfer to an archived event.' });

    toEventName = targetEv.event_name;

    // Compute Available General Fund
    // Logic: Total Incomes - Dashboard Expenses - Reserved Envelopes
    const summary = (txs || []).reduce((acc, tx) => {
      if (['donation', 'collection', 'allocation'].includes(tx.type)) {
        acc.income += Number(tx.amount);
      }
      // Track dashboard-impacting expenses
      if (tx.type === 'expense' && !tx.use_allocation) {
        acc.dashboard_expense += Number(tx.amount);
      }

      // Explicitly exclude internal 'transfer' from totalIncome summing
      // but keep it in breakdown for ledger awareness
      return acc;
    }, { expense: 0, donation: 0, collection: 0, allocation: 0, transfer: 0, dashboard_expense: 0 });

    const totalReserved = (events || []).reduce((sum, e) => sum + Number(e.allocated_budget), 0);
    const availableBalance = summary.income - summary.dashboard_expense - totalReserved;

    if (transferAmount > availableBalance) {
      return res.status(400).json({ 
        error: `Insufficient unreserved funds in General Fund. Available: ₱${availableBalance.toLocaleString()}.` 
      });
    }

    // UPDATE: Increase target event's budgets
    // Note: Since this is coming from the dashboard, it increases the total "Allocated" for this event.
    const { error: updErr } = await supabase.from('events').update({
      allocated_budget: Number(targetEv.allocated_budget) + transferAmount,
      remaining_budget: Number(targetEv.remaining_budget) + transferAmount
    }).eq('id', to_event_id);

    if (updErr) return res.status(500).json({ error: 'Failed to update target event budget.' });

  } 
  // ── CASE 2: Transfer from another Event ─────────────────────────────
  else {
    const [{ data: fromEv, error: fe }, { data: toEv, error: te }] = await Promise.all([
      supabase.from('events').select('id, event_name, remaining_budget, status').eq('id', from_event_id).single(),
      supabase.from('events').select('id, event_name, remaining_budget, status').eq('id', to_event_id).single(),
    ]);

    if (fe || !fromEv) return res.status(404).json({ error: 'Source event not found.' });
    if (te || !toEv)   return res.status(404).json({ error: 'Target event not found.' });

    fromEventName = fromEv.event_name;
    toEventName   = toEv.event_name;

    if (fromEv.status === 'archived') return res.status(400).json({ error: 'Cannot transfer from an archived event.' });
    if (Number(fromEv.remaining_budget) < transferAmount) {
      return res.status(400).json({ error: `Insufficient remaining budget in "${fromEv.event_name}". Available: ₱${Number(fromEv.remaining_budget).toLocaleString()}.` });
    }

    // Deduct from source, add to target
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('events').update({ remaining_budget: Number(fromEv.remaining_budget) - transferAmount }).eq('id', from_event_id),
      supabase.from('events').update({ remaining_budget: Number(toEv.remaining_budget) + transferAmount }).eq('id', to_event_id),
    ]);

    if (e1 || e2) return res.status(500).json({ error: 'Transfer failed. Please try again.' });
  }

  // ── SHARED: Record transfer and Audit ────────────────────────────
  await supabase.from('transactions').insert({
    event_id:         to_event_id,
    type:             'transfer', // Changed from allocation to transfer
    amount:           transferAmount,
    description:      `Budget transfer from "${fromEventName}": ${sanitizeText(reason)}`,
    added_by:         req.user.id,
    transaction_date: new Date().toISOString().split('T')[0],
  });

  logAudit(req.user.id, 'BUDGET_TRANSFER', {
    from_event_id,
    from_event_name: fromEventName,
    to_event_id,
    to_event_name:   toEventName,
    amount:          transferAmount,
    reason:          sanitizeText(reason),
  });

  res.json({
    message: `Successfully transferred ₱${transferAmount.toLocaleString()} from "${fromEventName}" to "${toEventName}".`
  });
});

// ── PATCH /api/admin/events/:id/archive ──────────────────────────────────────
router.patch('/events/:id/archive', requireOfficer, async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }

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
