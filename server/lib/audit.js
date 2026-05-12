// =============================================
// server/lib/audit.js — Audit Logging
// =============================================
const supabase = require('./supabase');

/**
 * Inserts an audit log entry for admin actions.
 * Fire-and-forget — never blocks the response.
 *
 * @param {string} userId    - Supabase user UUID
 * @param {string} action    - e.g. 'CREATE_EVENT', 'CREATE_TRANSACTION'
 * @param {object} details   - sanitized metadata about the action
 */
async function logAudit(userId, action, details = {}) {
  try {
    await supabase.from('audit_logs').insert({
      user_id:    userId,
      action:     action,
      details:    details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Never crash the app over audit logging failure
    console.error('[Audit] Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
