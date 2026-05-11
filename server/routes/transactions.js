const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

// GET /api/transactions — all transactions (optionally filter by event_id or type)
router.get('/', async (req, res) => {
  const { event_id, type, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('transactions')
    .select('*, profiles!added_by(full_name)')
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (event_id) query = query.eq('event_id', event_id);
  if (type)     query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/transactions — add a transaction with optional Google Drive receipt link (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const {
    event_id, type, amount, description,
    donor_name, transaction_date, receipt_url
  } = req.body;

  // Insert transaction (triggers balance sync automatically via DB trigger)
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      event_id,
      type,
      amount:           Number(amount),
      description,
      donor_name:       donor_name || null,
      receipt_url:      receipt_url || null,
      added_by:         req.user.id,
      transaction_date: transaction_date || new Date().toISOString().split('T')[0]
    })
    .select()
    .single();

  if (txError) return res.status(400).json({ error: txError.message });

  // Record receipt metadata if a link was provided
  if (receipt_url) {
    await supabase.from('receipts').insert({
      transaction_id: tx.id,
      file_url:       receipt_url,
      file_name:      'Google Drive Link',
      file_type:      'link/gdrive',
      uploaded_by:    req.user.id
    });
  }

  res.status(201).json(tx);
});

module.exports = router;
