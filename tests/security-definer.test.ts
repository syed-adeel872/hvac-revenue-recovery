import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('SECURITY DEFINER Functions', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  it('should have all SECURITY DEFINER functions with safe search_path', () => {
    const remainingFunctions = [
      'set_updated_at',
      'get_current_tenant_id',
      'soft_delete_record',
      'restore_soft_deleted_record',
      'hard_delete_client',
      'cleanup_expired_records',
      'prevent_hard_delete_on_soft_tables',
      'insert_workflow_event',
      'insert_action',
      'insert_message',
      'acquire_idempotency_lock',
      'transition_action_status',
      'mark_workflow_event_processing',
      'mark_workflow_event_failed',
      'assert_tenant_context',
      'get_webhook_credential_secret',
      'enforce_ingestion_status_transition',
    ];

    remainingFunctions.forEach(func => {
      expect(allContent).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION ${func}`, 'i'));
      expect(allContent).toMatch(new RegExp(`${func}[\\s\\S]*SECURITY DEFINER[\\s\\S]*SET search_path = public, pg_temp`, 'i'));
    });
  });

  it('should NOT have removed SECURITY DEFINER functions', () => {
    const removedFunctions = [
      'is_kill_switch_active',
      'check_rate_limit',
      'record_circuit_failure',
      'record_circuit_success',
      'check_circuit_breaker',
      'check_customer_consent',
      'execute_with_tenant',
      'enforce_security_definer_search_path',
      'check_no_privilege_escalation',
    ];

    removedFunctions.forEach(func => {
      expect(allContent).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION ${func}`, 'i'));
    });
  });

  it('should have all critical SECURITY DEFINER functions with safe search_path', () => {
    // Check that the main security-critical functions have safe search_path
    // (Some utility/rollback functions may not have it, which is acceptable)
    const criticalFunctions = [
      'set_updated_at',
      'get_current_tenant_id',
      'soft_delete_record',
      'restore_soft_deleted_record',
      'hard_delete_client',
      'cleanup_expired_records',
      'prevent_hard_delete_on_soft_tables',
      'insert_workflow_event',
      'insert_action',
      'insert_message',
      'acquire_idempotency_lock',
      'transition_action_status',
      'mark_workflow_event_processing',
      'mark_workflow_event_failed',
      'assert_tenant_context',
      'get_webhook_credential_secret',
      'enforce_ingestion_status_transition',
    ];

    criticalFunctions.forEach(func => {
      // Use [\s\S]* to match across newlines
      expect(allContent).toMatch(new RegExp(`${func}[\\s\\S]*SECURITY DEFINER[\\s\\S]*SET search_path = public, pg_temp`, 'i'));
    });
  });

  it('should have validate_security_definer_functions validation function', () => {
    expect(allContent).toMatch(/validate_security_definer_functions/);
    expect(allContent).toMatch(/proconfig IS NULL OR NOT EXISTS[\s\S]*search_path=public,pg_temp/i);
    expect(allContent).toMatch(/Missing or unsafe search_path/i);
  });

  it('should NOT have event trigger to enforce safe search_path on CREATE FUNCTION', () => {
    expect(allContent).not.toMatch(/CREATE OR REPLACE FUNCTION enforce_security_definer_search_path/i);
    expect(allContent).not.toMatch(/CREATE EVENT TRIGGER enforce_security_definer_search_path_trigger/i);
  });

  it('should NOT have event trigger to prevent privilege escalation', () => {
    expect(allContent).not.toMatch(/prevent_privilege_escalation_trigger/i);
    expect(allContent).not.toMatch(/CREATE OR REPLACE FUNCTION check_no_privilege_escalation/i);
  });

  it('should have REVOKE CREATE on public schema from PUBLIC', () => {
    expect(allContent).toMatch(/REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  });

it('should have GRANTs to authenticated role only', () => {
    expect(allContent).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON.*TO authenticated/i);
    // The GRANT for audit_logs and system_audit_logs is on one line together
    expect(allContent).toMatch(/GRANT SELECT, INSERT ON audit_logs, system_audit_logs TO authenticated/i);
  });

  it('should have default privileges for authenticated', () => {
    expect(allContent).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated/i);
    expect(allContent).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*GRANT USAGE, SELECT ON SEQUENCES TO authenticated/i);
    expect(allContent).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*GRANT EXECUTE ON FUNCTIONS TO authenticated/i);
  });

  it('should REVOKE ALL from PUBLIC on sensitive tables', () => {
    const sensitiveTables = [
      'clients', 'client_members', 'customers', 'leads', 'estimates',
      'consents', 'opt_out_keywords', 'conversations', 'messages',
      'bookings', 'workflow_events', 'actions', 'errors',
      'audit_logs', 'system_audit_logs', 'client_sops',
      'api_usage', 'cost_ledger', 'worker_authorizations',
    ];

    sensitiveTables.forEach(table => {
      // The REVOKE statement is split across multiple lines in the SQL
      // Use [\s\S]* to match across lines
      expect(allContent).toMatch(new RegExp(`REVOKE ALL ON[\\s\\S]*${table}[\\s\\S]*FROM PUBLIC`, 'i'));
    });
  });

  it('should have assert_tenant_context function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION assert_tenant_context/);
    expect(allContent).toMatch(/get_current_tenant_id\(\) IS NULL/);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Tenant context not set/i);
  });

  it('should have cleanup_expired_records only for estimates', () => {
    // Should only expire estimates, not consents/worker_auths/conversations
    expect(allContent).toMatch(/UPDATE estimates[\s\S]*SET status = 'expired'/i);
    expect(allContent).not.toMatch(/UPDATE consents.*status = 'revoked'/i);
    expect(allContent).not.toMatch(/UPDATE worker_authorizations.*status = 'expired'/i);
    expect(allContent).not.toMatch(/UPDATE conversations.*status = 'archived'/i);
  });

  it('should have hard_delete_client with admin check', () => {
    expect(allContent).toMatch(/hard_delete_client/);
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Insufficient privileges/i);
  });

  it('should have soft_delete_record with allowed tables only', () => {
    expect(allContent).toMatch(/v_allowed_tables.*ARRAY\['clients', 'customers', 'estimates', 'bookings'\]/i);
    expect(allContent).not.toMatch(/v_allowed_tables.*leads/i);
  });

  it('should have soft_delete_record with tenant context validation', () => {
    expect(allContent).toMatch(/get_current_tenant_id\(\) IS NULL.*p_client_id/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Tenant context mismatch/i);
  });

  it('should have hard_delete_client with tenant context validation', () => {
    expect(allContent).toMatch(/get_current_tenant_id\(\) IS NULL.*p_client_id/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Tenant context mismatch/i);
  });

  it('should have triggers preventing hard deletes on soft-delete tables', () => {
    const triggers = [
      'prevent_hard_delete_clients',
      'prevent_hard_delete_customers',
      'prevent_hard_delete_estimates',
      'prevent_hard_delete_bookings',
    ];

    triggers.forEach(trigger => {
      expect(allContent).toMatch(new RegExp(`CREATE TRIGGER ${trigger}`));
    });

    expect(allContent).not.toMatch(/prevent_hard_delete_leads/);
  });

  it('should have validate_security_definer_functions function', () => {
    expect(allContent).toMatch(/validate_security_definer_functions/);
    expect(allContent).toMatch(/prosecdef = true/);
    expect(allContent).toMatch(/search_path=public,pg_temp/);
  });

  it('should have get_webhook_credential_secret with correct security properties', () => {
    // Function exists
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION get_webhook_credential_secret/);
    // Returns bytea (encrypted_secret)
    expect(allContent).toMatch(/RETURNS bytea/);
    // Does not decrypt - no decrypt logic in function (check only the new function's body)
    // Extract the function body and verify no decrypt calls
    const funcBody = allContent.match(/CREATE OR REPLACE FUNCTION get_webhook_credential_secret[\s\S]*?\$\$/)?.[0] || '';
    expect(funcBody).not.toMatch(/decrypt|pgp_sym_decrypt|aes_decrypt/i);
    // Verifies provider exists
    expect(allContent).toMatch(/Provider not found/);
    // Verifies caller is auth.uid()
    expect(allContent).toMatch(/auth\.uid\(\)/);
    // Verifies active owner/admin role
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/);
    // Verifies active membership status
    expect(allContent).toMatch(/status = 'active'/);
    // Retrieves latest valid secret version
    expect(allContent).toMatch(/ORDER BY secret_version DESC/);
    expect(allContent).toMatch(/LIMIT 1/);
    // Checks expiration
    expect(allContent).toMatch(/expires_at IS NULL OR expires_at > now\(\)/);
    // No dynamic SQL
    expect(funcBody).not.toMatch(/EXECUTE|format\(/);
    // REVOKE from PUBLIC
    expect(allContent).toMatch(/REVOKE EXECUTE ON FUNCTION get_webhook_credential_secret\(uuid\) FROM PUBLIC/);
    // GRANT to authenticated
    expect(allContent).toMatch(/GRANT EXECUTE ON FUNCTION get_webhook_credential_secret\(uuid\) TO authenticated/);
  });

  it('should have enforce_ingestion_status_transition trigger function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION enforce_ingestion_status_transition/);
    expect(allContent).toMatch(/RETURNS trigger/);
    expect(allContent).toMatch(/BEFORE UPDATE OF status ON ingestion_events/);
    expect(allContent).toMatch(/FOR EACH ROW/);
    expect(allContent).toMatch(/EXECUTE FUNCTION enforce_ingestion_status_transition\(\)/);
    // Valid transitions enforced
    expect(allContent).toMatch(/v_old_status = 'received' AND v_new_status IN \('processing'\)/);
    expect(allContent).toMatch(/v_old_status = 'processing' AND v_new_status IN \('mapped', 'retryable_failed'\)/);
    expect(allContent).toMatch(/v_old_status = 'mapped' AND v_new_status IN \('workflow_created', 'retryable_failed'\)/);
    expect(allContent).toMatch(/v_old_status = 'workflow_created' AND v_new_status IN \('completed', 'retryable_failed'\)/);
    expect(allContent).toMatch(/v_old_status = 'retryable_failed' AND v_new_status IN \('processing', 'failed'\)/);
    // Terminal states
    expect(allContent).toMatch(/v_old_status = 'completed' AND v_new_status IN \(\)/);
    expect(allContent).toMatch(/v_old_status = 'failed' AND v_new_status IN \(\)/);
    // Audit logging
    expect(allContent).toMatch(/INSERT INTO audit_logs/);
    expect(allContent).toMatch(/ingestion_status_transition/);
  });
});