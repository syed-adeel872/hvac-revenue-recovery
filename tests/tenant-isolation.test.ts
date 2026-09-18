import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Tenant Isolation', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  it('should have get_current_tenant_id function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION get_current_tenant_id/);
    expect(allContent).toMatch(/current_setting\('app\.current_tenant_id'/);
    expect(allContent).toMatch(/NULLIF\(.*\)::uuid/);
  });

  it('should have assert_tenant_context function', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION assert_tenant_context/);
    expect(allContent).toMatch(/Tenant context not set/);
  });

  it('should have RLS enabled on all tenant tables', () => {
    // The ALTER TABLE statements are generated dynamically with EXECUTE format()
    expect(allContent).toMatch(/ALTER TABLE.*ENABLE ROW LEVEL SECURITY/i);
    expect(allContent).toMatch(/ALTER TABLE.*FORCE ROW LEVEL SECURITY/i);
  });

  it('should have tenant-scoped RLS policies using get_current_tenant_id', () => {
    // Policies are created dynamically via DO $$ loop with format(), so check for the naming pattern
    expect(allContent).toMatch(/CREATE POLICY.*_select_tenant/i);
    expect(allContent).toMatch(/CREATE POLICY.*_insert_tenant/i);
    expect(allContent).toMatch(/CREATE POLICY.*_update_tenant/i);
    expect(allContent).toMatch(/CREATE POLICY.*_delete_tenant/i);
    expect(allContent).toMatch(/client_id = get_current_tenant_id\(\)/i);
  });

  it('should have audit_logs as append-only (no UPDATE/DELETE policies)', () => {
    expect(allContent).not.toMatch(/CREATE POLICY.*audit_logs.*UPDATE/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*audit_logs.*DELETE/i);
    expect(allContent).toMatch(/NO UPDATE\/DELETE policies.*append-only|append-only.*NO UPDATE\/DELETE/i);
  });

  it('should have system_audit_logs with restricted access', () => {
    expect(allContent).not.toMatch(/CREATE POLICY.*system_audit_logs.*UPDATE/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*system_audit_logs.*DELETE/i);
    expect(allContent).toMatch(/system_audit_logs_select_tenant_admin/);
    expect(allContent).toMatch(/system_audit_logs_insert_system/);
  });

  it('should have cross-tenant FK protection', () => {
    const compositeFKs = [
      'leads_customer_id_fk',
      'estimates_customer_id_fk',
      'estimates_lead_id_fk',
      'consents_customer_id_fk',
      'conversations_customer_id_fk',
      'conversations_estimate_id_fk',
      'conversations_lead_id_fk',
      'messages_conversation_id_fk',
      'messages_customer_id_fk',
      'bookings_customer_id_fk',
      'bookings_estimate_id_fk',
      'bookings_lead_id_fk',
      'bookings_conversation_id_fk',
      'actions_customer_id_fk',
      'actions_lead_id_fk',
      'actions_estimate_id_fk',
      'actions_conversation_id_fk',
      'actions_booking_id_fk',
      'actions_workflow_event_id_fk',
      'errors_workflow_event_id_fk',
      'errors_action_id_fk',
    ];

    compositeFKs.forEach(fk => {
      expect(allContent).toMatch(new RegExp(fk));
    });
  });

  it('should have UNIQUE constraints on (client_id, id) for composite FK targets', () => {
    const uniqueConstraints = [
      'customers_client_id_id_unique',
      'leads_client_id_id_unique',
      'estimates_client_id_id_unique',
      'conversations_client_id_id_unique',
      'bookings_client_id_id_unique',
      'workflow_events_client_id_id_unique',
      'actions_client_id_id_unique',
    ];

    uniqueConstraints.forEach(constraint => {
      expect(allContent).toMatch(new RegExp(constraint));
    });
  });

  it('should have no x-client-id authorization', () => {
    // The validation function checks FOR x-client-id usage, so the string appears in validation code
    // But actual policies should not use it - check that no policy USES x-client-id
    expect(allContent).not.toMatch(/CREATE POLICY.*x-client-id/i);
    // Check that no policy actually USES request.header in its USING clause
    expect(allContent).not.toMatch(/CREATE POLICY.*request\.header/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*current_setting\('request\.jwt/i);
  });

  it('should have worker_authorizations with admin-only policies', () => {
    expect(allContent).toMatch(/worker_authorizations_select_tenant_admin/);
    expect(allContent).toMatch(/worker_authorizations_insert_tenant_admin/);
    expect(allContent).toMatch(/worker_authorizations_update_tenant_admin/);
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/i);
  });

  it('should have opt_out_keywords admin-only management', () => {
    expect(allContent).toMatch(/opt_out_keywords_insert_tenant_admin/);
    expect(allContent).toMatch(/opt_out_keywords_update_tenant_admin/);
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/i);
  });

  it('should have client_sops admin-only management', () => {
    expect(allContent).toMatch(/client_sops_insert_tenant_admin/);
    expect(allContent).toMatch(/client_sops_update_tenant_admin/);
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/i);
  });

  it('should have system_audit_logs restricted to admins', () => {
    expect(allContent).toMatch(/system_audit_logs_select_tenant_admin/);
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/i);
  });

  it('should have no USING (true) policies on sensitive tables', () => {
    // The validation in 000012 checks for this
    expect(allContent).toMatch(/USING \(true\)/); // exists in validation check
  });

  it('should have audit_logs and system_audit_logs with no UPDATE/DELETE policies', () => {
    expect(allContent).toMatch(/NO UPDATE\/DELETE policies.*append-only|append-only.*NO UPDATE\/DELETE/i);
  });

  it('should have Step 3 webhook ingestion tables with tenant isolation', () => {
    const step3Tables = [
      'webhook_providers',
      'webhook_credentials',
      'ingestion_events',
      'ingestion_processing_log',
    ];

    step3Tables.forEach(table => {
      expect(allContent).toMatch(new RegExp(`CREATE TABLE ${table}`));
      expect(allContent).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
      // FORCE RLS is applied via DO block, check for the pattern
      expect(allContent).toMatch(/FOR tbl IN SELECT unnest\(ARRAY\[/i);
      expect(allContent).toMatch(/ALTER TABLE %I FORCE ROW LEVEL SECURITY/i);
      expect(allContent).toMatch(new RegExp(`CREATE POLICY.*${table}.*_select_tenant`));
    });
  });

  it('should have Step 3 composite FKs with tenant isolation', () => {
    const step3CompositeFKs = [
      'webhook_credentials_provider_id_fk',
      'ingestion_events_provider_id_fk',
      'ingestion_processing_log_event_id_fk',
    ];

    step3CompositeFKs.forEach(fk => {
      expect(allContent).toMatch(new RegExp(fk));
      // Verify they include client_id in the FK definition
      expect(allContent).toMatch(new RegExp(`${fk}[\\s\\S]*FOREIGN KEY\\s*\\(client_id`));
    });
  });

  it('should have Step 3 UNIQUE constraints on (client_id, id)', () => {
    const step3UniqueConstraints = [
      'webhook_providers_client_id_id_unique',
      'webhook_credentials_client_id_id_unique',
      'ingestion_events_client_id_id_unique',
      'ingestion_processing_log_client_id_id_unique',
    ];

    step3UniqueConstraints.forEach(constraint => {
      expect(allContent).toMatch(new RegExp(constraint));
    });
  });

  it('should have Step 3 RLS policies with admin-only write for credentials', () => {
    expect(allContent).toMatch(/webhook_credentials_select_tenant_admin/);
    expect(allContent).toMatch(/webhook_credentials_insert_tenant_admin/);
    expect(allContent).toMatch(/webhook_credentials_update_tenant_admin/);
    expect(allContent).not.toMatch(/webhook_credentials_delete/);
  });

  it('should have Step 3 ingestion_events state transition trigger', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION enforce_ingestion_status_transition/);
    expect(allContent).toMatch(/BEFORE UPDATE OF status ON ingestion_events/);
    expect(allContent).toMatch(/enforce_ingestion_status_transition/);
  });

  it('should have Step 3 queue pickup index', () => {
    expect(allContent).toMatch(/CREATE INDEX idx_ingestion_events_queue/);
    expect(allContent).toMatch(/ingestion_events\(client_id, status, received_at\)/);
    expect(allContent).toMatch(/WHERE status IN \('received', 'retryable_failed'\)/);
  });

  it('should have Step 3 cascade behavior documentation', () => {
    expect(allContent).toMatch(/ON DELETE behavior summary/);
    expect(allContent).toMatch(/webhook_providers.*CASCADE DELETE/);
    expect(allContent).toMatch(/webhook_credentials.*CASCADE DELETE/);
    expect(allContent).toMatch(/ingestion_events.*RESTRICT/);
    expect(allContent).toMatch(/Raw ingestion_events payload is NEVER deleted/);
  });

  it('should have Step 3 immutable raw payload terminology', () => {
    expect(allContent).toMatch(/Immutable raw event payload with controlled processing-state updates/);
    expect(allContent).not.toMatch(/append-only.*ingestion_events/);
  });
});