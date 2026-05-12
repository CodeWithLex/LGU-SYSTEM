const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { sendAnnouncementEmail } = require('../lib/email');
const { sanitizeText, assertRequired } = require('../lib/validate');
const { logAudit } = require('../lib/audit');

const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH  = 5000;

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

  if (error) return res.status(500).json({ error: 'Failed to fetch announcements.' });
  res.json(data);
});

// POST /api/announcements (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { title, body } = req.body;

  // 1. Required fields
  const missing = assertRequired({ title, body });
  if (missing) return res.status(400).json({ error: missing });

  // 2. Sanitize (strips HTML tags — prevents XSS in emails and PDF)
  const cleanTitle = sanitizeText(String(title));
  const cleanBody  = sanitizeText(String(body));

  // 3. Length limits
  if (cleanTitle.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less.` });
  }
  if (cleanBody.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Body must be ${MAX_BODY_LENGTH} characters or less.` });
  }

  const { data, error } = await supabase
    .from('announcements')
    .insert({ title: cleanTitle, body: cleanBody })
    .select()
    .single();

  if (error) return res.status(400).json({ error: 'Failed to create announcement.' });

  // Audit log
  logAudit(req.user.id, 'POST_ANNOUNCEMENT', { announcement_id: data.id, title: cleanTitle });

  // Send email notifications in the background (non-blocking)
  sendAnnouncementEmail(cleanTitle, cleanBody).catch(err =>
    console.error('[Email] Background send failed:', err.message)
  );

  res.status(201).json({ ...data, email_status: 'sending' });
});

module.exports = router;
