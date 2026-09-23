const { loadEnv } = require('./load-env');
loadEnv();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const CLEAN_SLATE = process.argv.includes('--clean');

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../supabase/migrations');

const EXPECTED_MIGRATIONS = [
  '000001_initial_schema.sql',
  '000002_validation_tables.sql',
  '000003_booking_workflow.sql',
  '000004_security_core.sql',
  '000005_rls_policies.sql',
  '000006_cross_tenant_fks.sql',
  '000007_soft_delete_cleanup.sql',
  '000008_action_idempotency.sql',
  '000009_harden_functions.sql',
  '000010_security_validation.sql',
  '000011_rollback_hardening.sql',
  '000012_security_fixes.sql',
  '000013_webhook_ingestion.sql',
  '000014_kill_switch.sql',
  '000015_hardening_fixes.sql',
  '000016_production_hardening.sql',
  '000017_consistency_fixes.sql',
  '000018_message_status_expansion.sql',
];

function createClient() {
  return new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
}

async function runMigration(client, file) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  let sql = fs.readFileSync(filePath, 'utf8');

  // Strip ALTER SYSTEM and pg_reload_conf — pooler role lacks superuser
  sql = sql.replace(/ALTER SYSTEM SET[^;]+;/g, '-- ALTER SYSTEM skipped (pooler role)');
  sql = sql.replace(/SELECT pg_reload_conf\(\);/g, '-- pg_reload_conf skipped (pooler role)');

  // Patch 000005: only iterate tables that have deleted_at column
  if (file === '000005_rls_policies.sql') {
    sql = sql.replace(
      "'customers', 'leads', 'estimates', 'consents',\n        'conversations', 'messages', 'bookings',\n        'workflow_events', 'actions', 'errors',\n        'client_sops', 'api_usage', 'cost_ledger'",
      "'customers', 'leads', 'estimates', 'bookings'"
    );
  }

  // Split by semicolons to handle $$ blocks safely
  // Use a single query approach but wrapped in its own transaction
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    return { success: false, error: error.message };
  }
}

async function runAllMigrations() {
  console.log('='.repeat(60));
  console.log('SUPABASE DATABASE MIGRATION RUNNER');
  console.log('='.repeat(60));
  const projectRef = process.env.SUPABASE_PROJECT_REF || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://localhost').hostname.split('.')[0];
  console.log(`Project: ${projectRef}`);
  console.log(`Migrations: ${EXPECTED_MIGRATIONS.length}`);
  console.log(`Mode: Individual execution (each migration in own transaction)`);
  console.log('');

  // Validate all migration files exist
  const missingFiles = EXPECTED_MIGRATIONS.filter(f => !fs.existsSync(path.join(MIGRATIONS_DIR, f)));
  if (missingFiles.length > 0) {
    console.error('Missing migration files:');
    missingFiles.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }

  const client = createClient();
  try {
    await client.connect();
    console.log('Connected to database');
  } catch (error) {
    console.error(`Connection failed: ${error.message}`);
    process.exit(1);
  }

  if (CLEAN_SLATE) {
    console.log('CLEAN SLATE MODE: Dropping all objects in public schema...');
    try {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('Public schema reset.');
    } catch (error) {
      console.error(`Clean slate failed: ${error.message}`);
      await client.end();
      process.exit(1);
    }
  }

  let succeeded = 0;
  let failed = 0;
  const failures = [];

  for (const file of EXPECTED_MIGRATIONS) {
    const startTime = Date.now();
    process.stdout.write(`  ${file} ... `);

    const result = await runMigration(client, file);
    const elapsed = Date.now() - startTime;

    if (result.success) {
      console.log(`OK (${elapsed}ms)`);
      succeeded++;
    } else {
      console.log(`FAILED (${elapsed}ms): ${result.error}`);
      failed++;
      failures.push({ file, error: result.error });
    }
  }

  await client.end();

  console.log('');
  console.log('='.repeat(60));
  console.log(`MIGRATION SUMMARY: ${succeeded} succeeded, ${failed} failed`);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('');
    console.log('Failed migrations:');
    failures.forEach(({ file, error }) => {
      console.log(`  ${file}: ${error}`);
    });
  }

  // Post-migration verification
  console.log('');
  console.log('='.repeat(60));
  console.log('POST-MIGRATION VERIFICATION');
  console.log('='.repeat(60));

  const verifyClient = createClient();
  try {
    await verifyClient.connect();

    const tables = ['circuit_breaker_state', 'system_config', 'webhook_providers', 'webhook_credentials', 'ingestion_events', 'clients', 'customers', 'leads', 'estimates', 'bookings'];
    for (const table of tables) {
      const result = await verifyClient.query(
        "SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1) AS exists",
        [table]
      );
      const exists = result.rows[0].exists;
      console.log(`${exists ? 'PASS' : 'FAIL'} table ${table}`);
    }

    const functions = ['get_current_tenant_id', 'set_updated_at', 'get_webhook_credential_secret'];
    for (const func of functions) {
      const result = await verifyClient.query(
        "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace) AS exists",
        [func]
      );
      const exists = result.rows[0].exists;
      console.log(`${exists ? 'PASS' : 'FAIL'} function ${func}()`);
    }

    const rlsTables = ['clients', 'customers', 'circuit_breaker_state', 'system_config'];
    for (const table of rlsTables) {
      const result = await verifyClient.query(
        "SELECT relrowsecurity AS rls_enabled FROM pg_class WHERE relname = $1",
        [table]
      );
      const rls = result.rows[0]?.rls_enabled;
      console.log(`${rls ? 'PASS' : 'WARN'} RLS on ${table} (${rls ? 'enabled' : 'disabled'})`);
    }

    const auditResult = await verifyClient.query(
      "SELECT action, metadata, created_at FROM system_audit_logs WHERE action = 'migration_complete' AND metadata->>'migration' = '000016_production_hardening' ORDER BY created_at DESC LIMIT 1"
    );
    if (auditResult.rows.length > 0) {
      console.log(`PASS audit log entry for 000016_production_hardening (${auditResult.rows[0].created_at})`);
    } else {
      console.log('WARN audit log entry for 000016_production_hardening not found');
    }

    const grantResult = await verifyClient.query(
      "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE (grantee = 'authenticated') AND (table_name LIKE 'webhook_%' OR table_name LIKE 'ingestion_%') ORDER BY table_name, privilege_type"
    );
    const grantCount = grantResult.rows.length;
    console.log(`${grantCount > 0 ? 'PASS' : 'WARN'} webhook/ingestion grants for authenticated (${grantCount} grants)`);

    await verifyClient.end();
  } catch (error) {
    console.error(`Verification error: ${error.message}`);
    await verifyClient.end();
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

runAllMigrations().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
