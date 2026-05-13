const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manually parse .env to avoid dotenv dependency issues in this context
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length) env[key.trim()] = value.join('=').trim();
});

const supabaseUrl = env['SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, amount, description, event_id, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    console.error(error);
    return;
  }

  console.log('--- RECENT TRANSACTIONS ---');
  data.forEach(t => {
    console.log(`[${t.id}] ${t.created_at.substring(0,10)} | ${t.type.padEnd(10)} | ₱${String(t.amount).padStart(8)} | ${t.event_id ? 'Event' : 'GEN' } | ${t.description.substring(0,50)}`);
  });
}

check();
