// =============================================
// server/lib/supabase.js — Shared Supabase Admin Client
// All routes import from here (single instance)
// =============================================
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key || url.includes('your-supabase')) {
  console.error('❌ Missing Supabase credentials. Please fill in your .env file.');
  process.exit(1);
}

const supabaseAdmin = createClient(url, key);

module.exports = supabaseAdmin;
