import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Action Idempotency', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  it('should have UNIQUE constraint on workflow_events for idempotency', () => {
    expect(allContent).toMatch(/UNIQUE.*client_id.*idempotency_key/i);
    expect(allContent).toMatch(/workflow_events.*idempotency_key/i);
  });

  it('should have UNIQUE constraint on actions for idempotency', () => {
    expect(allContent).toMatch(/UNIQUE.*client_id.*idempotency_key.*WHERE idempotency_key IS NOT NULL/i);
  });

  it('should have UNIQUE constraint on messages for provider idempotency', () => {
    expect(allContent).toMatch(/UNIQUE.*client_id.*conversation_id.*external_message_id/i);
  });

  it('should have UNIQUE constraint on bookings for idempotency', () => {
    expect(allContent).toMatch(/UNIQUE.*client_id.*booking_number/i);
    expect(allContent).toMatch(/UNIQUE.*client_id.*external_id/i);
  });

  it('should have UNIQUE constraint on estimates for idempotency', () => {
    expect(allContent).toMatch(/UNIQUE.*client_id.*estimate_number/i);
    expect(allContent).toMatch(/UNIQUE.*client_id.*external_id/i);
  });

  it('should have insert_workflow_event function with ON CONFLICT DO NOTHING', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION insert_workflow_event/);
    expect(allContent).toMatch(/ON CONFLICT.*client_id.*idempotency_key.*DO NOTHING/i);
    expect(allContent).toMatch(/RETURNING \* INTO v_event/i);
  });

  it('should have insert_action function with ON CONFLICT DO NOTHING', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION insert_action/);
    expect(allContent).toMatch(/ON CONFLICT.*client_id.*idempotency_key.*DO NOTHING/i);
    expect(allContent).toMatch(/RETURNING \* INTO v_action/i);
  });

  it('should have insert_message function with ON CONFLICT DO NOTHING', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE FUNCTION insert_message/);
    expect(allContent).toMatch(/ON CONFLICT.*client_id.*conversation_id.*external_message_id.*DO NOTHING/i);
    expect(allContent).toMatch(/RETURNING \* INTO v_message/i);
  });

  it('should have insert_workflow_event function with tenant context validation', () => {
    expect(allContent).toMatch(/get_current_tenant_id\(\) IS NULL.*p_client_id/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Tenant context mismatch/i);
  });

  it('should have insert_action function with tenant context validation', () => {
    expect(allContent).toMatch(/get_current_tenant_id\(\) IS NULL.*p_client_id/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Tenant context mismatch/i);
  });

  it('should have insert_message function with tenant context validation', () => {
    expect(allContent).toMatch(/get_current_tenant_id\(\) IS NULL.*p_client_id/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Tenant context mismatch/i);
  });

  it('should have insert_action function with risk-based approval logic', () => {
    expect(allContent).toMatch(/IF p_risk_level IN \('yellow', 'red'\)[\s\S]*v_approval_required := true/i);
  });

  it('should have transition_action_status with valid state transitions', () => {
    expect(allContent).toMatch(/WHEN v_current_status = 'pending'[\s\S]*p_new_status IN \('approved', 'rejected', 'executing', 'cancelled', 'expired'\)/i);
    expect(allContent).toMatch(/WHEN v_current_status = 'approved'[\s\S]*p_new_status IN \('executing', 'cancelled', 'expired'\)/i);
    expect(allContent).toMatch(/WHEN v_current_status = 'executing'[\s\S]*p_new_status IN \('completed', 'failed', 'cancelled'\)/i);
    expect(allContent).toMatch(/RAISE EXCEPTION.*Invalid status transition/i);
  });

  it('should have transition_action_status with audit logging', () => {
    expect(allContent).toMatch(/INSERT INTO audit_logs[\s\S]*action_status_transition/i);
    expect(allContent).toMatch(/old_values[\s\S]*jsonb_build_object\('status'/i);
    expect(allContent).toMatch(/new_values[\s\S]*jsonb_build_object\('status'.*output.*error_message/i);
  });

  it('should have workflow event processing helpers', () => {
    expect(allContent).toMatch(/mark_workflow_event_processing/);
    expect(allContent).toMatch(/mark_workflow_event_failed/);
    expect(allContent).toMatch(/processing_started_at = now\(\)/i);
    expect(allContent).toMatch(/processing_error = p_error/i);
    expect(allContent).toMatch(/retry_count = retry_count \+ 1/i);
  });

  it('should have advisory lock helper for concurrency', () => {
    expect(allContent).toMatch(/acquire_idempotency_lock/);
    expect(allContent).toMatch(/pg_try_advisory_xact_lock/i);
    expect(allContent).toMatch(/pg_sleep.*p_timeout_ms/i);
  });

  it('should have idempotency_key_usage view', () => {
    expect(allContent).toMatch(/CREATE OR REPLACE VIEW idempotency_key_usage/);
    expect(allContent).toMatch(/workflow_events.*idempotency_key/i);
    expect(allContent).toMatch(/actions.*idempotency_key/i);
    expect(allContent).toMatch(/messages.*external_message_id/i);
    expect(allContent).toMatch(/GRANT SELECT ON idempotency_key_usage TO authenticated/i);
  });

  it('should have idempotency validation function', () => {
    expect(allContent).toMatch(/validate_idempotency_constraints/);
    expect(allContent).toMatch(/workflow_events.*client_id.*idempotency_key/i);
    expect(allContent).toMatch(/actions.*client_id.*idempotency_key/i);
    expect(allContent).toMatch(/messages.*client_id.*conversation_id.*external_message_id/i);
    expect(allContent).toMatch(/bookings.*client_id.*booking_number/i);
    expect(allContent).toMatch(/estimates.*client_id.*estimate_number/i);
  });
});