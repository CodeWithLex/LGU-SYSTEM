const express  = require('express');
const router   = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, requireOfficer } = require('../middleware/roles');
const { sanitizeText } = require('../lib/validate');

/**
 * Helper to dispatch a notification to database.
 * Used internally by system triggers (events, transactions, announcements, units).
 */
async function createNotification({ userId = null, targetRole = 'all', type = 'system', title, message, category, link = null, metadata = {} }) {
  try {
    const cleanTitle   = sanitizeText(String(title || ''));
    const cleanMessage = sanitizeText(String(message || ''));
    const validCategory = ['events', 'transactions', 'reports', 'announcements', 'units', 'system'].includes(category) ? category : 'system';

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        target_role: targetRole,
        type,
        title: cleanTitle,
        message: cleanMessage,
        category: validCategory,
        link,
        metadata
      })
      .select()
      .single();

    if (error) {
      console.error('[Notifications] Failed to create notification:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Notifications] Exception in createNotification:', err.message);
    return null;
  }
}

// GET /api/notifications - Get unread category badges & recent notifications for logged in user
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role || 'student';

  try {
    // 1. Fetch relevant notifications for user (role-targeted or specific to user)
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    // Filter by target role ('all', user's role, or specifically assigned user_id)
    if (userRole === 'admin' || userRole === 'officer') {
      query = query.or(`user_id.eq.${userId},target_role.in.(all,officer,admin)`);
    } else {
      query = query.or(`user_id.eq.${userId},target_role.in.(all,student)`);
    }

    const { data: notifications, error: notifErr } = await query;
    if (notifErr) throw notifErr;

    // 2. Fetch read records for this user
    const notifIds = (notifications || []).map(n => n.id);
    let readIds = new Set();
    if (notifIds.length > 0) {
      const { data: reads } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', userId)
        .in('notification_id', notifIds);

      if (reads) {
        reads.forEach(r => readIds.add(r.notification_id));
      }
    }

    // 3. Compute unread counts per category
    const unreadByCategory = {
      events: 0,
      transactions: 0,
      reports: 0,
      announcements: 0,
      units: 0,
      system: 0
    };

    const formattedList = (notifications || []).map(n => {
      const isRead = readIds.has(n.id);
      if (!isRead) {
        const cat = unreadByCategory.hasOwnProperty(n.category) ? n.category : 'system';
        unreadByCategory[cat] += 1;
      }
      return {
        ...n,
        is_read: isRead
      };
    });

    const totalUnread = Object.values(unreadByCategory).reduce((a, b) => a + b, 0);

    res.json({
      total_unread: totalUnread,
      unread_by_category: unreadByCategory,
      notifications: formattedList
    });
  } catch (err) {
    console.error('[Notifications] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// POST /api/notifications/read - Mark category or specific notification as read
router.post('/read', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role || 'student';
  const { category, notification_id } = req.body;

  try {
    let toMark = [];

    if (notification_id) {
      toMark = [notification_id];
    } else if (category) {
      // Find all unread notifications in this category for the user
      let query = supabase
        .from('notifications')
        .select('id')
        .eq('category', category);

      if (userRole === 'admin' || userRole === 'officer') {
        query = query.or(`user_id.eq.${userId},target_role.in.(all,officer,admin)`);
      } else {
        query = query.or(`user_id.eq.${userId},target_role.in.(all,student)`);
      }

      const { data: catNotifs } = await query;
      if (catNotifs && catNotifs.length > 0) {
        toMark = catNotifs.map(n => n.id);
      }
    }

    if (toMark.length > 0) {
      const readInserts = toMark.map(nId => ({
        notification_id: nId,
        user_id: userId
      }));

      // Upsert/insert read records
      await supabase
        .from('notification_reads')
        .upsert(readInserts, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
    }

    res.json({ success: true, marked_count: toMark.length });
  } catch (err) {
    console.error('[Notifications] POST /read error:', err.message);
    res.status(500).json({ error: 'Failed to mark notification(s) as read.' });
  }
});

// POST /api/notifications - Manual dispatch by Officers/Admins
router.post('/', requireOfficer, async (req, res) => {
  const { userId, targetRole, type, title, message, category, link } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  const created = await createNotification({
    userId: userId || null,
    targetRole: targetRole || 'all',
    type: type || 'system',
    title,
    message,
    category: category || 'announcements',
    link: link || null
  });

  if (!created) {
    return res.status(500).json({ error: 'Failed to dispatch notification.' });
  }

  res.status(201).json(created);
});

module.exports = {
  router,
  createNotification
};
