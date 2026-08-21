require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('❌ Supabase credentials missing (SUPABASE_URL, SUPABASE_SERVICE_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

// 005 drops and recreates the tracker tables — running it against a
// database that already has student data WIPES every student record.
// It is only safe for fresh environments; require an explicit opt-in.
if (!process.argv.includes('--force')) {
  console.error('⚠️  005_credit_unit_tracker.sql DROPs and recreates subjects/student_units/');
  console.error('   curriculum_requirements. Re-running it on a live database deletes all');
  console.error('   student academic records. If this is truly a FRESH environment, rerun with:');
  console.error('       node scripts/apply-tracker-schema.js --force');
  process.exit(1);
}

async function run() {
  console.log('🚀 Reading 005_credit_unit_tracker.sql...');
  const sqlPath = path.join(__dirname, '../supabase/migrations/005_credit_unit_tracker.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ Migration file not found:', sqlPath);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  console.log('📦 Executing SQL migration via RPC execute_sql...');
  // Split sql statement by semicolons or run as-is
  const { data, error } = await supabase.rpc('execute_sql', { sql: sqlContent });

  if (error) {
    console.error('❌ RPC execute_sql failed:', error.message);
    console.log('Try to execute commands one by one to isolate the issue...');
    
    // Fallback: split by semicolon and execute individually (naive split)
    const queries = sqlContent
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i] + ';';
      console.log(`Executing snippet [${i + 1}/${queries.length}]: ${q.substring(0, 50)}...`);
      const { error: subErr } = await supabase.rpc('execute_sql', { sql: q });
      if (subErr) {
        console.error(`❌ Snippet failed: ${subErr.message}`);
      }
    }
  } else {
    console.log('✅ Migration SQL executed successfully!');
  }
}

run();
