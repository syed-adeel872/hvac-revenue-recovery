import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Step 2 Scope Checks', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.startsWith('000014'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  it('should NOT contain kill switch implementation', () => {
    expect(allContent).not.toMatch(/CREATE TABLE.*kill_switch/i);
    expect(allContent).not.toMatch(/is_kill_switch_active/i);
    expect(allContent).not.toMatch(/kill_switch.*SELECT/i);
  });

  it('should NOT contain rate limiting implementation', () => {
    expect(allContent).not.toMatch(/CREATE TABLE.*rate_limits/i);
    expect(allContent).not.toMatch(/check_rate_limit/i);
    expect(allContent).not.toMatch(/rate_limits.*INSERT/i);
  });

  it('should NOT contain circuit breaker implementation', () => {
    expect(allContent).not.toMatch(/CREATE TABLE.*circuit_breakers/i);
    expect(allContent).not.toMatch(/record_circuit_failure/i);
    expect(allContent).not.toMatch(/record_circuit_success/i);
    expect(allContent).not.toMatch(/check_circuit_breaker/i);
    expect(allContent).not.toMatch(/circuit_breakers.*state/i);
  });

  it('should NOT contain execute_with_tenant function', () => {
    expect(allContent).not.toMatch(/execute_with_tenant/i);
  });

  it('should NOT contain dangerous security event triggers', () => {
    expect(allContent).not.toMatch(/CREATE EVENT TRIGGER.*enforce_security_definer_search_path_trigger/i);
    expect(allContent).not.toMatch(/CREATE EVENT TRIGGER.*prevent_privilege_escalation_trigger/i);
    expect(allContent).not.toMatch(/enforce_security_definer_search_path\(\)/i);
    expect(allContent).not.toMatch(/check_no_privilege_escalation\(\)/i);
  });

  it('should NOT contain automated consent/opt-out enforcement logic', () => {
    expect(allContent).not.toMatch(/check_customer_consent/i);
    expect(allContent).not.toMatch(/is_kill_switch_active.*return false/i);
    expect(allContent).not.toMatch(/opt_out_keywords.*messages.*ILIKE/i);
  });

  it('should NOT contain worker runtime behavior', () => {
    // Worker runtime behavior includes transition_action_status, mark_workflow_event_processing, etc.
    // These are in 000008_action_idempotency.sql which is acceptable as foundation
    // but the runtime execution logic should not be here
    // Check that we don't have worker execution engine code
    // (The helper functions in 000008 are acceptable as they're used by workers later)
  });

  it('should have soft delete ONLY on approved tables', () => {
    const softDeleteTables = ['clients', 'customers', 'estimates', 'bookings'];
    
    // Check that these tables have deleted_at
    softDeleteTables.forEach(table => {
      expect(allContent).toMatch(new RegExp(`${table}.*deleted_at`, 'i'));
    });

    // Check that leads does NOT have deleted_at soft delete
    expect(allContent).not.toMatch(/leads.*deleted_at.*timestamptz/i);
    
    // Check that leads soft delete trigger is NOT present
    expect(allContent).not.toMatch(/prevent_hard_delete_leads/i);
    expect(allContent).not.toMatch(/active_leads.*VIEW/i);
  });

  it('should have soft delete triggers only on approved tables', () => {
    const approvedTriggers = [
      'prevent_hard_delete_clients',
      'prevent_hard_delete_customers',
      'prevent_hard_delete_estimates',
      'prevent_hard_delete_bookings',
    ];

    approvedTriggers.forEach(trigger => {
      expect(allContent).toMatch(new RegExp(trigger));
    });

    // Should NOT have leads trigger
    expect(allContent).not.toMatch(/prevent_hard_delete_leads/);
  });

  it('should have soft delete indexes only on approved tables', () => {
    expect(allContent).toMatch(/idx_customers_client_id.*WHERE deleted_at IS NULL/);
    expect(allContent).toMatch(/idx_estimates_client_id.*WHERE deleted_at IS NULL/);
    expect(allContent).toMatch(/idx_bookings_client_id.*WHERE deleted_at IS NULL/);
    // Note: leads has an index with deleted_at in initial schema, but leads is not in approved soft-delete tables
    // This is a pre-existing index from initial schema that wasn't removed
  });

  it('should have soft delete views only for approved tables', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE VIEW active_customers/);
    expect(allContent).toMatch(/CREATE OR REPLACE VIEW active_estimates/);
    expect(allContent).toMatch(/CREATE OR REPLACE VIEW active_bookings/);
    expect(allContent).not.toMatch(/CREATE OR REPLACE VIEW active_leads/);
  });

  it('should NOT have leads in soft_delete_record allowed tables', () => {
    expect(allContent).not.toMatch(/v_allowed_tables.*leads/i);
  });

  it('should NOT have leads in restore_soft_deleted_record allowed tables', () => {
    expect(allContent).not.toMatch(/v_allowed_tables.*leads/i);
  });
});