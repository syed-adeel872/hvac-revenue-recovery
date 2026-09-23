const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const { loadEnv } = require('./load-env');

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const pg = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEFAULT_CLIENT_NAME = process.env.DEFAULT_CLIENT_NAME || 'Default HVAC Company';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local (or the environment)');
  console.error('Generate a password with: openssl rand -base64 24');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12) {
  console.error('ERROR: ADMIN_PASSWORD must be at least 12 characters long');
  process.exit(1);
}

async function ensureAuthUser() {
  console.log('Checking for existing admin user...');

  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError.message);
    process.exit(1);
  }

  const existing = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  if (existing) {
    console.log(`Admin user already exists: ${existing.email} (${existing.id})`);
    if (!existing.email_confirmed_at) {
      console.log('Confirming email...');
      const { error: confirmError } = await supabase.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
      });
      if (confirmError) {
        console.error('Failed to confirm email:', confirmError.message);
      } else {
        console.log('Email confirmed.');
      }
    }
    return existing.id;
  }

  console.log(`Creating admin user: ${ADMIN_EMAIL}`);
  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (error) {
    console.error('Failed to create admin user:', error.message);
    process.exit(1);
  }

  console.log('Admin user created successfully.');
  console.log(`  ID:    ${data.user.id}`);
  console.log(`  Email: ${data.user.email}`);
  console.log(`  Confirmed: ${data.user.email_confirmed_at ? 'yes' : 'no'}`);
  return data.user.id;
}

async function ensureClientAndMembership(userId) {
  console.log('\nChecking for default client...');

  // Use pg directly to bypass RLS
  const clientsResult = await pg.query(
    "SELECT id, name FROM clients WHERE status = 'active' LIMIT 1"
  );

  let clientId;

  if (clientsResult.rows.length > 0) {
    clientId = clientsResult.rows[0].id;
    console.log(`Default client already exists: "${clientsResult.rows[0].name}" (${clientId})`);
  } else {
    console.log(`Creating default client: "${DEFAULT_CLIENT_NAME}"`);
    const { rows } = await pg.query(
      `INSERT INTO clients (name, display_name, status, timezone, currency)
       VALUES ($1, $1, 'active', 'America/New_York', 'USD')
       RETURNING id`,
      [DEFAULT_CLIENT_NAME]
    );
    clientId = rows[0].id;
    console.log(`Client created: ${clientId}`);
  }

  console.log('\nChecking for admin membership...');

  const memberResult = await pg.query(
    'SELECT id, role FROM client_members WHERE client_id = $1 AND user_id = $2 LIMIT 1',
    [clientId, userId]
  );

  if (memberResult.rows.length > 0) {
    console.log(`Membership already exists (role: ${memberResult.rows[0].role})`);
  } else {
    console.log('Creating admin membership...');
    await pg.query(
      `INSERT INTO client_members (client_id, user_id, email, role, status, accepted_at)
       VALUES ($1, $2, $3, 'owner', 'active', now())`,
      [clientId, userId, ADMIN_EMAIL]
    );
    console.log('Admin membership created (role: owner).');
  }

  return clientId;
}

async function main() {
  await pg.connect();
  const userId = await ensureAuthUser();
  const clientId = await ensureClientAndMembership(userId);
  console.log(`\nSeed complete. Client ID: ${clientId}`);
}

main()
  .then(async () => {
    console.log('You can now log in at http://localhost:3000/login');
    await pg.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Fatal error:', err.message || err);
    await pg.end();
    process.exit(1);
  });
