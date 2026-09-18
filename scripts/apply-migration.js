require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function applyMigration() {
  console.log('🔍 Supabase Database Migration - 20260905000001_initial_schema');
  console.log('='.repeat(60));
  console.log(`Project URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}`);
  console.log('');

  // Read the migration file
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20260905000001_initial_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded (size:', sql.length, 'chars)');
  console.log('');

  // Split into individual statements (split by semicolon followed by newline)
  // This is a simple split - for production use a proper SQL parser
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📋 Found ${statements.length} SQL statements to execute`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim() + ';';
    if (!stmt.trim()) continue;

    // Skip comments
    if (statements[i].trim().startsWith('--')) continue;

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statements[i] });
      
      if (error) {
        // Try direct query if rpc doesn't exist
        const { error: directError } = await supabase.rpc('exec_sql', { sql: statements[i] });
        if (directError) {
          // Try direct raw query via REST API
          const { error: rawError } = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ sql: statements[i] })
          });
          
          if (rawError) {
            throw new Error(`Failed: ${directError?.message || 'Unknown error'}`);
          }
        }
      }
      
      successCount++;
      if (i % 20 === 0) {
        process.stdout.write('.');
      }
    } catch (err) {
      errorCount++;
      console.log(`\n❌ Statement ${i + 1} failed: ${err.message}`);
      console.log('Statement:', statements[i].substring(0, 200) + '...');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total statements: ${statements.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
  
  // Verify tables exist
  console.log('\n🔍 Verifying table creation...');
  const expectedTables = [
    'clients', 'client_members', 'customers', 'leads', 'estimates',
    'consents', 'opt_out_keywords', 'conversations', 'messages',
    'bookings', 'workflow_events', 'actions', 'errors',
    'audit_logs', 'client_sops', 'api_usage', 'cost_ledger'
  ];

  for (const table of expectedTables) {
    const { data, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`❌ ${table}: NOT FOUND (${error.message})`);
    } else {
      console.log(`✅ ${table}: EXISTS`);
    }
  }

  console.log('\n✅ Migration verification complete');
}

applyMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});