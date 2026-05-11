const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { sendAnnouncementEmail } = require('../lib/email');

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

// GET /api/announcements
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/announcements — insert and email all students (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }

  // Insert into DB
  const { data, error } = await supabase
    .from('announcements')
    .insert({ title, body })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Send email notifications in the background (non-blocking)
  sendAnnouncementEmail(title, body).catch(err =>
    console.error('[Email] Background send failed:', err)
  );

  res.status(201).json({ ...data, email_status: 'sending' });
});

module.exports = router;
