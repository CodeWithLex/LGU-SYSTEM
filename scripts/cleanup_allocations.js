require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  console.log('Cleaning up corrupted event allocations...');
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .eq('type', 'allocation')
    .not('event_id', 'is', null);

  if (error) {
    console.error('Failed:', error);
  } else {
    console.log('Successfully purged automatic allocations.');
  }
}

run();
