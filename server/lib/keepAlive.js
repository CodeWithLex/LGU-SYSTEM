// =============================================
// server/lib/keepAlive.js
// Prevents Render from spinning down AND keeps
// Supabase from pausing due to inactivity.
// =============================================

const supabase = require('./supabase');

const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (Render sleeps at 15)

function start(serverUrl) {
  setInterval(async () => {
    // 1. Ping the server itself to prevent Render spin-down
    try {
      const res = await fetch(`${serverUrl}/api/health`);
      const data = await res.json();
      console.log(`[keep-alive] Server pinged - ${data.timestamp}`);
    } catch (err) {
      console.warn('[keep-alive] Server ping failed:', err.message);
    }

    // 2. Run a lightweight Supabase query to prevent project pause
    try {
      await supabase.from('events').select('id', { count: 'planned', head: true });
      console.log('[keep-alive] Supabase pinged');
    } catch (err) {
      console.warn('[keep-alive] Supabase ping failed:', err.message);
    }
  }, PING_INTERVAL_MS);

  console.log(`[keep-alive] Running every ${PING_INTERVAL_MS / 60000} minutes`);
}

module.exports = { start };
