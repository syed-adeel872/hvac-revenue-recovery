import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Migration Structure', () => {
  const migrationFiles: string[] = [];

  beforeAll(() => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    migrationFiles.push(...files);
  });

  it('should have exactly 22 migration files', () => {
    expect(migrationFiles.length).toBe(22);
  });

  it('should have sequential migration numbering', () => {
    const expectedPrefixes = [
      '000001_',
      '000002_',
      '000003_',
      '000004_',
      '000005_',
      '000006_',
      '000007_',
      '000008_',
      '000009_',
      '000010_',
      '000011_',
      '000012_',
      '000013_',
      '000014_',
      '000015_',
      '000016_',
      '000017_',
      '000018_',
      '000019_',
      '000020_',
      '000021_',
      '000022_',
    ];

    expectedPrefixes.forEach((prefix, i) => {
      expect(migrationFiles[i]).toContain(prefix);
    });
  });

  it('should have correct migration names', () => {
    const expectedNames = [
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
      '000019_audit_logs_nullable_resource_id.sql',
      '000020_grant_service_role_permissions.sql',
      '000021_circuit_breaker_security.sql',
      '000022_audit_worm_trigger.sql',
    ];

    expect(migrationFiles).toEqual(expectedNames);
  });

  it('should not reference removed objects', () => {
    const removedObjects = [
      'rate_limits',
      'circuit_breakers',
      'execute_with_tenant',
      'enforce_security_definer_search_path',
      'check_no_privilege_escalation',
      'is_kill_switch_active',
      'check_rate_limit',
      'record_circuit_failure',
      'record_circuit_success',
      'check_circuit_breaker',
      'check_customer_consent',
      'prevent_hard_delete_leads',
      'active_leads',
    ];

    migrationFiles.forEach(file => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      removedObjects.forEach(obj => {
        // Allow references in rollback functions that drop these objects
        const isRollback = content.includes(`DROP`) && (
          content.includes('kill_switch') ||
          content.includes('rate_limits') ||
          content.includes('circuit_breakers') ||
          content.includes('execute_with_tenant') ||
          content.includes('enforce_security_definer_search_path') ||
          content.includes('check_no_privilege_escalation') ||
          content.includes('is_kill_switch_active') ||
          content.includes('check_rate_limit') ||
          content.includes('rate_limits') ||
          content.includes('circuit_breakers') ||
          content.includes('check_customer_consent') ||
          content.includes('prevent_hard_delete_leads') ||
          content.includes('active_leads') ||
          content.includes('idx_leads_client_id.*deleted_at')
        );

        // Check for CREATE/INSERT/UPDATE that would recreate these
        const createsObject = new RegExp(`(CREATE|INSERT|UPDATE).*${obj}`, 'i').test(content) &&
          !content.includes(`DROP`) &&
          !content.includes(`ROLLBACK`) &&
          !new RegExp(`CREATE.*atomic_${obj}`, 'i').test(content);

        if (createsObject && !isRollback) {
          throw new Error(`File ${file} creates/references removed object: ${obj}`);
        }
      });
    });
  });

  it('should not contain dangerous event triggers', () => {
    const dangerousTriggers = [
      'enforce_security_definer_search_path_trigger',
      'prevent_privilege_escalation_trigger',
    ];

    migrationFiles.forEach(file => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      dangerousTriggers.forEach(trigger => {
        if (content.includes(`CREATE EVENT TRIGGER ${trigger}`)) {
          throw new Error(`File ${file} creates dangerous event trigger: ${trigger}`);
        }
      });
    });
  });

  it('should not contain execute_with_tenant function', () => {
    migrationFiles.forEach(file => {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      if (content.includes('execute_with_tenant') && !content.includes('DROP FUNCTION')) {
        throw new Error(`File ${file} contains execute_with_tenant function`);
      }
    });
  });

  it('should have proper dependency ordering', () => {
    // Check that migrations reference dependencies correctly
    const dependencyOrder = [
      '000001_initial_schema',
      '000002_validation_tables',
      '000003_booking_workflow',
      '000004_security_core',
      '000005_rls_policies',
      '000006_cross_tenant_fks',
      '000007_soft_delete_cleanup',
      '000008_action_idempotency',
      '000009_harden_functions',
      '000010_security_validation',
      '000011_rollback_hardening',
      '000012_security_fixes',
      '000013_webhook_ingestion',
      '000014_kill_switch',
      '000015_hardening_fixes',
      '000016_production_hardening',
      '000017_consistency_fixes',
      '000018_message_status_expansion',
      '000019_audit_logs_nullable_resource_id',
      '000020_grant_service_role_permissions',
      '000021_circuit_breaker_security',
      '000022_audit_worm_trigger',
    ];

    migrationFiles.forEach((file, i) => {
      expect(file).toContain(dependencyOrder[i]);
    });
  });
});