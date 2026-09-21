-- Migration 000022: Absolute WORM compliance for audit tables
-- BEFORE UPDATE/DELETE triggers that unconditionally raise exceptions
-- Prevents mutation even by service_role, superuser, or bypassrls roles

BEGIN;

-- 1. WORM trigger function for audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % operations are not permitted', TG_OP
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_logs_worm_trigger
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();

-- 2. WORM trigger function for system_audit_logs
CREATE OR REPLACE FUNCTION prevent_system_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'system_audit_logs is append-only: % operations are not permitted', TG_OP
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$;

CREATE TRIGGER system_audit_logs_worm_trigger
  BEFORE UPDATE OR DELETE ON system_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_system_audit_log_mutation();

-- 3. Fix misleading GRANTs from migration 000015
-- Revoke UPDATE and DELETE on audit tables from all roles
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON audit_logs FROM service_role;
REVOKE UPDATE, DELETE ON system_audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON system_audit_logs FROM service_role;

COMMIT;
