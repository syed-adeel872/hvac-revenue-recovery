import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Audit Foundations', () => {
  const allContent: string = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');

  it('should have audit_logs table with required columns', () => {
    expect(allContent).toMatch(/CREATE TABLE audit_logs/i);
    expect(allContent).toMatch(/client_id uuid NOT NULL REFERENCES clients\(id\)/i);
    expect(allContent).toMatch(/actor_type text NOT NULL.*user.*worker.*system.*webhook.*api/i);
    expect(allContent).toMatch(/actor_id uuid/i);
    expect(allContent).toMatch(/action text NOT NULL/i);
    expect(allContent).toMatch(/resource_type text NOT NULL/i);
    expect(allContent).toMatch(/resource_id uuid NOT NULL/i);
    expect(allContent).toMatch(/old_values jsonb/i);
    expect(allContent).toMatch(/new_values jsonb/i);
    expect(allContent).toMatch(/metadata jsonb/i);
    expect(allContent).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  });

  it('should have audit_logs append-only (no UPDATE/DELETE policies)', () => {
    expect(allContent).toMatch(/CREATE POLICY audit_logs_select_tenant/i);
    expect(allContent).toMatch(/CREATE POLICY audit_logs_insert_tenant/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*audit_logs.*UPDATE/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*audit_logs.*DELETE/i);
    expect(allContent).toMatch(/NO UPDATE.*DELETE.*append-only|append-only.*NO UPDATE.*DELETE/i);
  });

  it('should have system_audit_logs table', () => {
    expect(allContent).toMatch(/CREATE TABLE system_audit_logs/i);
    expect(allContent).toMatch(/actor_type text NOT NULL.*system.*migration.*security.*admin/i);
    expect(allContent).toMatch(/client_id uuid REFERENCES clients\(id\) ON DELETE SET NULL/i);
    expect(allContent).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  });

  it('should have system_audit_logs restricted to admins', () => {
    expect(allContent).toMatch(/system_audit_logs_select_tenant_admin/i);
    expect(allContent).toMatch(/system_audit_logs_insert_system/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*system_audit_logs.*UPDATE/i);
    expect(allContent).not.toMatch(/CREATE POLICY.*system_audit_logs.*DELETE/i);
    expect(allContent).toMatch(/role IN \('owner', 'admin'\)/i);
  });

  it('should have audit_logs indexes', () => {
    expect(allContent).toMatch(/idx_audit_logs_client_id/i);
    expect(allContent).toMatch(/idx_audit_logs_actor_type/i);
    expect(allContent).toMatch(/idx_audit_logs_resource/i);
    expect(allContent).toMatch(/idx_audit_logs_created_at/i);
  });

  it('should have system_audit_logs indexes', () => {
    expect(allContent).toMatch(/idx_system_audit_logs_client_id/i);
    expect(allContent).toMatch(/idx_system_audit_logs_action/i);
    expect(allContent).toMatch(/idx_system_audit_logs_created_at/i);
  });

  it('should have audit_logs append-only GRANTs', () => {
    // The GRANT is on one line for both tables
    expect(allContent).toMatch(/GRANT SELECT, INSERT ON audit_logs, system_audit_logs TO authenticated/i);
    expect(allContent).not.toMatch(/GRANT UPDATE.*ON audit_logs.*TO authenticated/i);
    expect(allContent).not.toMatch(/GRANT DELETE.*ON audit_logs.*TO authenticated/i);
  });

  it('should have system_audit_logs restricted GRANTs', () => {
    // The GRANT is on one line for both tables
    expect(allContent).toMatch(/GRANT SELECT, INSERT ON audit_logs, system_audit_logs TO authenticated/i);
    expect(allContent).not.toMatch(/GRANT UPDATE.*ON system_audit_logs.*TO authenticated/i);
    expect(allContent).not.toMatch(/GRANT DELETE.*ON system_audit_logs.*TO authenticated/i);
  });

  it('should have transition_action_status write to audit_logs', () => {
    expect(allContent).toMatch(/INSERT INTO audit_logs[\s\S]*action_status_transition/i);
    expect(allContent).toMatch(/old_values[\s\S]*jsonb_build_object\('status', v_current_status\)/i);
    expect(allContent).toMatch(/new_values[\s\S]*jsonb_build_object\('status', p_new_status.*output.*error_message/i);
  });

  it('should have system_audit_logs entry on migration complete', () => {
    expect(allContent).toMatch(/INSERT INTO system_audit_logs[\s\S]*migration_complete/i);
    expect(allContent).toMatch(/jsonb_build_object[\s\S]*migrations_applied[\s\S]*12/i);
  });

  it('should have audit_logs as tenant-scoped', () => {
    expect(allContent).toMatch(/CREATE POLICY audit_logs_select_tenant ON audit_logs/i);
    expect(allContent).toMatch(/CREATE POLICY audit_logs_insert_tenant ON audit_logs/i);
    expect(allContent).toMatch(/client_id = get_current_tenant_id\(\)/i);
  });

  it('should have system_audit_logs cross-tenant access for admins', () => {
    expect(allContent).toMatch(/system_audit_logs_select_tenant_admin/i);
    expect(allContent).toMatch(/client_id IS NULL[\s\S]*owner[\s\S]*admin/i);
    expect(allContent).toMatch(/client_id IS NOT NULL[\s\S]*get_current_tenant_id\(\)/i);
  });
});