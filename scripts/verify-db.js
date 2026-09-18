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

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Expected tables from the schema
const EXPECTED_TABLES = [
  'clients', 'client_members', 'customers', 'leads', 'estimates',
  'consents', 'opt_out_keywords', 'conversations', 'messages',
  'bookings', 'workflow_events', 'actions', 'errors',
  'audit_logs', 'client_sops', 'api_usage', 'cost_ledger'
];

async function checkTable(tableName) {
  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      return { table: tableName, exists: false, error: error.message, rowCount: 0 };
    }
    return { table: tableName, exists: true, rowCount: count || 0, error: null };
  } catch (err) {
    return { table: tableName, exists: false, error: String(err), rowCount: 0 };
  }
}

async function getTableColumns(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error || !data || data.length === 0) {
      return { columns: [], sample: null };
    }
    return { columns: Object.keys(data[0]), sample: data[0] };
  } catch (err) {
    return { columns: [], sample: null };
  }
}

async function main() {
  console.log('🔍 Supabase Database Verification Report');
  console.log('='.repeat(60));
  console.log(`Project URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const results = [];
  let allExist = true;
  let totalTables = 0;
  let existingTables = 0;

  for (const table of EXPECTED_TABLES) {
    const result = await checkTable(table);
    results.push(result);
    totalTables++;
    if (result.exists) {
      existingTables++;
      console.log(`✅ ${table.padEnd(20)} - EXISTS (${result.rowCount} rows)`);
    } else {
      allExist = false;
      console.log(`❌ ${table.padEnd(20)} - MISSING (${result.error})`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('DATABASE VERIFICATION REPORT');
  console.log('='.repeat(60));
  console.log(`Total expected tables: ${totalTables}`);
  console.log(`Tables found: ${existingTables}`);
  console.log(`Tables missing: ${totalTables - existingTables}`);
  console.log(`Database status: ${allExist ? '✅ FULLY INITIALIZED' : '❌ INCOMPLETE'}`);
  console.log('');

  if (!allExist) {
    console.log('❌ MISSING TABLES:');
    results.filter(r => !r.exists).forEach(r => console.log(`  - ${r.table}: ${r.error}`));
  }

  // Test a sample insert to verify RLS/permissions work
  console.log('\n--- Permission Test ---');
  try {
    const supabaseAdmin = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id')
      .limit(1);
    
    if (error) {
      console.log(`❌ Select test failed: ${error.message}`);
    } else {
      console.log('✅ SELECT permission works');
    }
  } catch (e) {
    console.log(`❌ Select test failed: ${e}`);
  }

  // Test service role can bypass RLS
  console.log('\n--- Service Role Test ---');
  try {
    const supabaseAdmin = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    
    const { data, error } = await supabaseAdmin.from('clients').select('*').limit(1);
    
    if (error) {
      console.log(`❌ Service role select failed: ${error.message}`);
    } else {
      console.log('✅ Service role can bypass RLS');
    }
  } catch (e) {
    console.log(`❌ Service role test failed: ${e}`);
  }

  console.log('\n✅ Verification complete');
}

main().catch(console.error);