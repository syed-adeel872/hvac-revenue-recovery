import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Validation Functions', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

it('should have validate_tenant_isolation function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION validate_tenant_isolation/);
    expect(allContent).toMatch(/RETURNS TABLE\s*\([\s\S]*table_name text[\s\S]*rls_enabled boolean[\s\S]*policy_count integer[\s\S]*issues text/);
    expect(allContent).toMatch(/c\.relrowsecurity = true/i);
    expect(allContent).toMatch(/SELECT count\(\*\) INTO v_policy_count/i);
  });

  it('should have validate_worker_authorization_model function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION validate_worker_authorization_model/);
    expect(allContent).toMatch(/worker_authorizations table exists/i);
    expect(allContent).toMatch(/worker_authorizations RLS enabled/i);
    expect(allContent).toMatch(/worker_authorizations has policies/i);
    expect(allContent).toMatch(/No service_role shortcuts in functions/i);
  });

  it('should have validate_composite_fks function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION validate_composite_fks/);
    expect(allContent).toMatch(/information_schema\.table_constraints/i);
    expect(allContent).toMatch(/information_schema\.key_column_usage/i);
    expect(allContent).toMatch(/information_schema\.constraint_column_usage/i);
    expect(allContent).toMatch(/Missing client_id in composite FK/i);
  });

  it('should have validate_idempotency_constraints function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION validate_idempotency_constraints/);
    expect(allContent).toMatch(/workflow_events.*client_id.*idempotency_key/i);
    expect(allContent).toMatch(/actions.*client_id.*idempotency_key/i);
    expect(allContent).toMatch(/messages.*client_id.*conversation_id.*external_message_id/i);
    expect(allContent).toMatch(/bookings.*client_id.*booking_number/i);
    expect(allContent).toMatch(/estimates.*client_id.*estimate_number/i);
  });

  it('should have validate_audit_log_append_only function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION validate_audit_log_append_only/);
    expect(allContent).toMatch(/audit_logs.*system_audit_logs/i);
    expect(allContent).toMatch(/polcmd = 'u'/i);
    expect(allContent).toMatch(/polcmd = 'd'/i);
    expect(allContent).toMatch(/UPDATE policy exists.*not append-only|DELETE policy exists.*not append-only/i);
  });

  it('should have validate_security_definer_functions function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION validate_security_definer_functions/);
    expect(allContent).toMatch(/prosecdef = true/i);
    expect(allContent).toMatch(/search_path=public,pg_temp/i);
    expect(allContent).toMatch(/Missing or unsafe search_path/i);
  });

  it('should have run_all_validations function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION run_all_validations/);
    expect(allContent).toMatch(/validate_tenant_isolation/i);
    expect(allContent).toMatch(/validate_worker_authorization_model/i);
    expect(allContent).toMatch(/validate_composite_fks/i);
    expect(allContent).toMatch(/validate_idempotency_constraints/i);
    expect(allContent).toMatch(/validate_audit_log_append_only/i);
    expect(allContent).toMatch(/validate_security_definer_functions/i);
  });

  it('should have x-client-id authorization check', () => {
    expect(allContent).toMatch(/x-client-id|request\.header|current_setting\('request\.jwt'/i);
    expect(allContent).toMatch(/Potential header-based authorization in policies/i);
  });

it('should have cross-table CHECK/EXISTS constraint check', () => {
    expect(allContent).toMatch(/connamespace = 'public'::regnamespace/);
    expect(allContent).toMatch(/contype = 'c'/i);
    // The check is split across multiple lines in the migration
    expect(allContent).toMatch(/%SELECT%/);
    expect(allContent).toMatch(/%EXISTS%/);
    expect(allContent).toMatch(/%IN \(SELECT%/);
    expect(allContent).toMatch(/Constraints with potential cross-table references/i);
  });
});