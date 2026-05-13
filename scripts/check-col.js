require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  const { data, error } = await supabase.from('transactions').select('use_allocation').limit(1);
  if (error) {
    console.error('❌ Check failed:', error.message);
  } else {
    console.log('✅ Column exists!');
  }
}
check();
