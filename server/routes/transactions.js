const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const supabase = require('../lib/supabase');

// Multer in-memory storage for Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and PDF files are allowed.'));
  }
});

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

// POST /api/transactions — add a transaction with optional receipt upload (admin only)
router.post('/', requireAdmin, upload.single('receipt'), async (req, res) => {
  const {
    event_id, type, amount, description,
    donor_name, transaction_date
  } = req.body;

  let receiptUrl = null;

  // Upload receipt if provided
  if (req.file) {
    const ext  = req.file.originalname.split('.').pop();
    const path = `receipts/${Date.now()}-${req.user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
    receiptUrl = urlData.publicUrl;
  }

  // Insert transaction (triggers balance sync automatically)
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      event_id, type, amount: Number(amount),
      description, donor_name,
      receipt_url: receiptUrl,
      added_by: req.user.id,
      transaction_date: transaction_date || new Date().toISOString().split('T')[0]
    })
    .select()
    .single();

  if (txError) return res.status(400).json({ error: txError.message });

  // Record receipt metadata if uploaded
  if (receiptUrl) {
    await supabase.from('receipts').insert({
      transaction_id: tx.id,
      file_url:       receiptUrl,
      file_name:      req.file.originalname,
      file_type:      req.file.mimetype,
      uploaded_by:    req.user.id
    });
  }

  res.status(201).json(tx);
});

module.exports = router;
