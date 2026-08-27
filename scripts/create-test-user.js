require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('--- Creating Test Accounts ---');

  // Account 1: Simulates new user without course/year (Triggers the Onboarding Setup Modal on login)
  const user1Email = 'test.newuser@g.cjc.edu.ph';
  const user1Pass = 'Password123!';
  const user1Name = 'Alex Rivera (New Student)';

  try {
    // Delete if already exists to ensure fresh start
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const found1 = existingUsers?.users?.find(u => u.email === user1Email);
    if (found1) {
      console.log(`Deleting existing ${user1Email}...`);
      await supabase.auth.admin.deleteUser(found1.id);
    }

    const { data: user1, error: err1 } = await supabase.auth.admin.createUser({
      email: user1Email,
      password: user1Pass,
      email_confirm: true,
      user_metadata: {
        full_name: user1Name
        // course and year_level intentionally omitted so the onboarding modal triggers!
      }
    });

    if (err1) throw err1;
    console.log(`✅ Created Fresh New User (Modal Test):`);
    console.log(`   Email:    ${user1Email}`);
    console.log(`   Password: ${user1Pass}`);
    console.log(`   Name:     ${user1Name}`);
    console.log(`   Behavior: Logs in -> Pops up "Welcome to COE Portal!" Onboarding Modal\n`);

  } catch (err) {
    console.error('Error creating user 1:', err.message);
  }

  // Account 2: Fully configured active student account
  const user2Email = 'test.student@g.cjc.edu.ph';
  const user2Pass = 'Password123!';
  const user2Name = 'Sam Santos';

  try {
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const found2 = existingUsers?.users?.find(u => u.email === user2Email);
    if (found2) {
      console.log(`Deleting existing ${user2Email}...`);
      await supabase.auth.admin.deleteUser(found2.id);
    }

    const { data: user2, error: err2 } = await supabase.auth.admin.createUser({
      email: user2Email,
      password: user2Pass,
      email_confirm: true,
      user_metadata: {
        full_name: user2Name,
        course: 'BSCoE',
        year_level: '2',
        enrollment_year: 2024
      }
    });

    if (err2) throw err2;
    console.log(`✅ Created Active Student Account:`);
    console.log(`   Email:    ${user2Email}`);
    console.log(`   Password: ${user2Pass}`);
    console.log(`   Name:     ${user2Name}`);
    console.log(`   Course:   Computer Engineering (BSCoE)`);
    console.log(`   Behavior: Logs in directly to student dashboard\n`);

  } catch (err) {
    console.error('Error creating user 2:', err.message);
  }
}

main();
