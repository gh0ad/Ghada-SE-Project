#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function findDbUserByEmail(email) {
  const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows;
}

async function findAuthUserByEmail(email) {
  // listUsers is paginated; for simplicity we page until found or exhausted
  let page = 1;
  const perPage = 100;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ per_page: perPage, page });
    if (error) throw error;
    const users = data && data.users ? data.users : [];
    const found = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (!users.length || users.length < perPage) break;
    page++;
  }
  return null;
}

async function deleteAuthUser(userId) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
  return true;
}

async function recreateDbUserFromAuth(authUser) {
  // authUser should have id and email
  const id = authUser.id;
  const email = authUser.email;
  const username = (email && email.split('@')[0]) || id;
  // Minimal insert - adapt as needed
  const sql = `INSERT INTO users (id, username, email, account_type, created_at)
               VALUES ($1,$2,$3,'student',NOW()) RETURNING *`;
  const res = await pool.query(sql, [id, username, email]);
  return res.rows[0];
}

function showHelp() {
  console.log('\nUsage: node scripts/reconcile-user.js <email> [--delete-auth] [--recreate-db] [--confirm]');
  console.log('\nExamples:');
  console.log('  node scripts/reconcile-user.js you@sm.imamu.edu.sa --delete-auth --confirm');
  console.log('  node scripts/reconcile-user.js you@sm.imamu.edu.sa --recreate-db --confirm');
  console.log('\nFlags:');
  console.log('  --delete-auth   Delete the Supabase Auth user (irreversible)');
  console.log('  --recreate-db   Recreate a minimal row in the `users` table linked to the existing Supabase auth id');
  console.log('  --confirm       Required to perform destructive actions. Without it the script only reports.');
}

(async function main(){
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { showHelp(); process.exit(0); }
  const email = argv[0];
  const doDeleteAuth = argv.includes('--delete-auth');
  const doRecreateDb = argv.includes('--recreate-db');
  const confirmed = argv.includes('--confirm');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env to use Supabase Admin APIs.');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL must be set in .env');
    process.exit(2);
  }

  console.log('Checking DB for user with email:', email);
  const dbUsers = await findDbUserByEmail(email);
  if (dbUsers.length) {
    console.log('Found users in DB:');
    dbUsers.forEach(u => console.log(` - id=${u.id} username=${u.username} email=${u.email}`));
  } else {
    console.log('No user row found in `users` for that email.');
  }

  console.log('\nChecking Supabase Auth for that email...');
  const authUser = await findAuthUserByEmail(email);
  if (authUser) {
    console.log('Found Supabase Auth user:', authUser.id, authUser.email, 'created_at', authUser.created_at);
  } else {
    console.log('No Supabase Auth user found for that email.');
  }

  if (doDeleteAuth) {
    if (!authUser) { console.log('Skipping delete: no auth user found'); }
    else if (!confirmed) {
      console.log('\nDRY RUN: --delete-auth requested but --confirm not provided. No changes made.');
      console.log('To actually delete run with --confirm. Deleting is irreversible.');
    } else {
      try {
        console.log('\nDeleting Supabase Auth user id:', authUser.id);
        await deleteAuthUser(authUser.id);
        console.log('Deleted supabase auth user', authUser.id);
      } catch (e) {
        console.error('Failed to delete Supabase user:', e.message || e);
      }
    }
  }

  if (doRecreateDb) {
    if (!authUser) { console.log('Cannot recreate DB user: no Supabase auth user found to link to.'); }
    else if (!confirmed) {
      console.log('\nDRY RUN: --recreate-db requested but --confirm not provided. No changes made.');
      console.log('To actually recreate run with --confirm.');
    } else {
      try {
        console.log('\nRecreating DB user row for auth id:', authUser.id);
        const created = await recreateDbUserFromAuth(authUser);
        console.log('Inserted DB user:', created);
      } catch (e) {
        console.error('Failed to recreate DB user row:', e.message || e);
      }
    }
  }

  if (!doDeleteAuth && !doRecreateDb) {
    console.log('\nNo action flags provided. The checks above are all that were performed.');
    console.log('Run with --delete-auth to remove the Supabase Auth user, or --recreate-db to reinsert a minimal DB user row.');
  }

  // exit
  process.exit(0);
})();
