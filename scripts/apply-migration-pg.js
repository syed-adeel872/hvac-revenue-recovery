const { loadEnv } = require('./load-env');
loadEnv();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local');
  console.error('Set it to your Supabase database connection string:');
  console.error('  postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres');
  process.exit(1);
}

async function applyMigration() {
  const migrationFile = process.argv[2] || '000015_hardening_fixes.sql';
  const migrationPath = path.resolve(__dirname, '../supabase/migrations', migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log(`Applying migration: ${migrationFile}`);
  console.log(`SQL length: ${sql.length} chars`);

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('Connected to database');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log(`Migration ${migrationFile} applied successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Migration failed: ${error.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
