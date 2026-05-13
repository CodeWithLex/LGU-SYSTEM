const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { sanitizeText, validateDriveUrl, isPositiveNumber, isValidEnum, assertRequired } = require('../lib/validate');
const { logAudit } = require('../lib/audit');

const VALID_TX_TYPES = ['expense', 'donation', 'collection', 'allocation'];
const MAX_LIMIT      = 100;
const MAX_OFFSET     = 10000;

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

// GET /api/transactions
router.get('/', async (req, res) => {
  const event_id = req.query.event_id   || null;
  const type     = req.query.type       || null;
  const limit    = Math.min(Number(req.query.limit)  || 50, MAX_LIMIT);
  const offset   = Math.min(Number(req.query.offset) || 0,  MAX_OFFSET);

  // Validate type enum if provided
  if (type && !isValidEnum(type, VALID_TX_TYPES)) {
    return res.status(400).json({ error: 'Invalid transaction type filter.' });
  }

  let query = supabase
    .from('transactions')
    .select('*, profiles!added_by(full_name)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (event_id) query = query.eq('event_id', event_id);
  if (type)     query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch transactions.' });
  res.json(data);
});

// POST /api/transactions (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { event_id, type, amount, description, donor_name, transaction_date, receipt_url, use_allocation } = req.body;

  // 1. Required field check
  const missing = assertRequired({ event_id, type, amount, description, transaction_date });
  if (missing) return res.status(400).json({ error: missing });

  // 2. Type enum validation
  if (!isValidEnum(type, VALID_TX_TYPES)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TX_TYPES.join(', ')}.` });
  }

  // 3. Amount must be a positive number
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ error: 'Amount must be a positive number.' });
  }

  // 4. Sanitize inputs
  const cleanDesc   = sanitizeText(description);
  const cleanDonor  = donor_name ? sanitizeText(donor_name) : null;
  const cleanReceipt = receipt_url ? validateDriveUrl(receipt_url) : null;

  if (cleanDesc.length > 500) {
    return res.status(400).json({ error: 'Description must be 500 characters or less.' });
  }

  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      event_id,
      type,
      amount:           Number(amount),
      description:      cleanDesc,
      donor_name:       cleanDonor,
      receipt_url:      cleanReceipt,
      added_by:         req.user.id,
      transaction_date: transaction_date,
      use_allocation:   use_allocation !== undefined ? Boolean(use_allocation) : true
    })
    .select()
    .single();

  if (txError) return res.status(400).json({ error: 'Failed to create transaction.' });

  if (receipt_url) {
    await supabase.from('receipts').insert({
      transaction_id: tx.id,
      file_url:       receipt_url,
      file_name:      'Google Drive Link',
      file_type:      'link/gdrive',
      uploaded_by:    req.user.id,
    });
  }

  // Check over-budget for expenses
  if (type === 'expense') {
    const { data: ev } = await supabase.from('events').select('allocated_budget, remaining_budget').eq('id', event_id).single();
    if (ev && Number(ev.remaining_budget) < Number(ev.allocated_budget) * 0.1) {
      tx.over_budget_warning = true;
      logAudit(req.user.id, 'OVER_BUDGET_ALERT', { event_id, remaining_budget: ev.remaining_budget });
    }
  }

  logAudit(req.user.id, 'CREATE_TRANSACTION', {
    transaction_id: tx.id,
    event_id,
    type,
    amount:      Number(amount),
    description: cleanDesc
  });

  res.status(201).json(tx);
});

// POST /api/transactions/bulk (admin only)
router.post('/bulk', requireAdmin, async (req, res) => {
  const { transactions } = req.body;

  if (!Array.isArray(transactions) || transactions.length === 0 || transactions.length > 500) {
    return res.status(400).json({ error: 'Valid transactions array (max 500) is required.' });
  }

  // 1. Initial Validation & Sanitization Loop
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const missing = assertRequired({ 
      event_id: tx.event_id, 
      type: tx.type, 
      amount: tx.amount, 
      description: tx.description, 
      transaction_date: tx.transaction_date 
    });
    if (missing) return res.status(400).json({ error: `Row ${i + 1} missing data: ${missing}` });
    
    if (!isValidEnum(tx.type, VALID_TX_TYPES)) {
      return res.status(400).json({ error: `Row ${i + 1} error: Invalid type (${tx.type}).` });
    }
    if (!isPositiveNumber(tx.amount)) {
      return res.status(400).json({ error: `Row ${i + 1} error: Amount must be > 0.` });
    }
    
    // Transform inline for insertion
    tx.amount = Number(tx.amount);
    tx.description = sanitizeText(String(tx.description)).slice(0, 500);
    tx.donor_name = tx.donor_name ? sanitizeText(String(tx.donor_name)) : null;
    tx.added_by = req.user.id;
  }

  // 2. Safe Bulk Insert to Database
  const { data, error } = await supabase
    .from('transactions')
    .insert(transactions)
    .select();

  if (error) {
    return res.status(500).json({ error: 'Database bulk insert failed: ' + error.message });
  }

  logAudit(req.user.id, 'BULK_IMPORT_TRANSACTIONS', { 
    count: transactions.length, 
    sample_event_id: transactions[0].event_id 
  });

  res.status(201).json({ message: 'Bulk import successful.', count: transactions.length });
});

// PATCH /api/transactions/:id — edit with mandatory reason (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { amount, description, transaction_date, reason, receipt_url } = req.body;

  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ error: 'A reason of at least 5 characters is required to edit a transaction.' });
  }

  const updates = {};
  if (amount !== undefined) {
    if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'Amount must be a positive number.' });
    updates.amount = Number(amount);
  }
  if (description !== undefined) updates.description = sanitizeText(String(description)).slice(0, 500);
  if (transaction_date !== undefined) updates.transaction_date = transaction_date;
  if (receipt_url !== undefined) updates.receipt_url = sanitizeText(String(receipt_url));

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update.' });
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: 'Failed to update transaction.' });

  logAudit(req.user.id, 'EDIT_TRANSACTION', { transaction_id: id, changes: updates, reason: sanitizeText(reason) });
  res.json(data);
});

// DELETE /api/transactions/:id — soft-delete with mandatory reason (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ error: 'A reason of at least 5 characters is required to delete a transaction.' });
  }

  const { data: tx } = await supabase.from('transactions').select('description').eq('id', id).single();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) return res.status(400).json({ error: 'Failed to delete transaction.' });

  logAudit(req.user.id, 'DELETE_TRANSACTION', { 
    transaction_id: id, 
    description: tx?.description || 'Unknown', 
    reason: sanitizeText(reason) 
  });
  res.json({ message: 'Transaction deleted successfully.' });
});

module.exports = router;
