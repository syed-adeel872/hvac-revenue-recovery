-- Migration: 000007_soft_delete_cleanup.sql
-- Description: Soft delete handling and cleanup functions
-- Depends on: 000001_initial_schema.sql, 000002_validation_tables.sql, 000003_booking_workflow.sql, 000004_security_core.sql, 000005_rls_policies.sql, 000006_cross_tenant_fks.sql

-- ============================================================
-- Soft Delete: Only on business-important tables
-- ============================================================
-- Tables with soft delete (deleted_at):
-- - clients
-- - customers
-- - estimates
-- - bookings

-- Tables WITHOUT soft delete (per requirements):
-- - leads (status-based pipeline management)
-- - client_members (hard delete by admin)
-- - consents (status-based revocation)
-- - opt_out_keywords (is_active flag)
-- - conversations (status-based)
-- - messages (immutable once created)
-- - workflow_events (immutable once created)
-- - actions (status-based)
-- - errors (resolved flag)
-- - audit_logs (append-only, immutable)
-- - system_audit_logs (append-only, immutable)
-- - client_sops (status-based)
-- - api_usage (immutable once recorded)
-- - cost_ledger (immutable once recorded)
-- - worker_authorizations (status-based revocation)

-- ============================================================
-- Soft Delete Helper Functions
-- ============================================================

-- Function to soft delete a record (sets deleted_at)
CREATE OR REPLACE FUNCTION soft_delete_record(
    p_table_name text,
    p_client_id uuid,
    p_record_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_allowed_tables text[] := ARRAY['clients', 'customers', 'estimates', 'bookings'];
    v_sql text;
    v_count integer;
BEGIN
    -- Validate table is allowed for soft delete
    IF p_table_name NOT IN (SELECT unnest(v_allowed_tables)) THEN
        RAISE EXCEPTION 'Soft delete not allowed on table: %', p_table_name;
    END IF;

    -- Verify tenant context matches
    IF get_current_tenant_id() IS NULL OR get_current_tenant_id() != p_client_id THEN
        RAISE EXCEPTION 'Tenant context mismatch or not set';
    END IF;

    -- Build and execute soft delete
    v_sql := format(
        'UPDATE %I SET deleted_at = now(), updated_at = now() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
        p_table_name
    );

    EXECUTE v_sql USING p_record_id, p_client_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

-- Function to restore a soft-deleted record
CREATE OR REPLACE FUNCTION restore_soft_deleted_record(
    p_table_name text,
    p_client_id uuid,
    p_record_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_allowed_tables text[] := ARRAY['clients', 'customers', 'estimates', 'bookings'];
    v_sql text;
    v_count integer;
BEGIN
    -- Validate table is allowed for soft delete
    IF p_table_name NOT IN (SELECT unnest(v_allowed_tables)) THEN
        RAISE EXCEPTION 'Restore not allowed on table: %', p_table_name;
    END IF;

    -- Verify tenant context matches
    IF get_current_tenant_id() IS NULL OR get_current_tenant_id() != p_client_id THEN
        RAISE EXCEPTION 'Tenant context mismatch or not set';
    END IF;

    -- Build and execute restore
    v_sql := format(
        'UPDATE %I SET deleted_at = NULL, updated_at = now() WHERE id = $1 AND client_id = $2 AND deleted_at IS NOT NULL',
        p_table_name
    );

    EXECUTE v_sql USING p_record_id, p_client_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
END;
$$;

-- ============================================================
-- Hard Delete: Admin-only for complete removal (GDPR, etc.)
-- ============================================================
-- Only for clients table, with extreme caution
CREATE OR REPLACE FUNCTION hard_delete_client(
    p_client_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count integer;
BEGIN
    -- Verify tenant context matches
    IF get_current_tenant_id() IS NULL OR get_current_tenant_id() != p_client_id THEN
        RAISE EXCEPTION 'Tenant context mismatch or not set';
    END IF;

    -- Verify caller is owner/admin of this client
    IF NOT EXISTS (
        SELECT 1 FROM client_members
        WHERE user_id = auth.uid()
        AND client_id = p_client_id
        AND status = 'active'
        AND role IN ('owner', 'admin')
    ) THEN
        RAISE EXCEPTION 'Insufficient privileges for hard delete';
    END IF;

    -- Delete all related data first (cascades will handle most)
    -- Soft-deleted records in child tables will be hard-deleted by cascade

    -- Finally delete the client
    DELETE FROM clients WHERE id = p_client_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count > 0;
END;
$$;

-- ============================================================
-- Cleanup Function: Remove expired/obsolete records
-- ============================================================
-- NOTE: This function only handles schema-defined expiration logic
-- (estimates with expires_at). It does NOT implement runtime
-- consent/opt-out enforcement or worker runtime behavior.
-- Those belong to later build steps (Safety Worker, etc.).
CREATE OR REPLACE FUNCTION cleanup_expired_records(
    p_client_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_results jsonb := '{}'::jsonb;
    v_count integer;
BEGIN
    -- If no client_id provided, use current tenant context
    IF p_client_id IS NULL THEN
        p_client_id := get_current_tenant_id();
    END IF;

    IF p_client_id IS NULL THEN
        RAISE EXCEPTION 'Client ID required (provide parameter or set tenant context)';
    END IF;

    -- 1. Expire old estimates (where expires_at < now() and status = 'sent')
    UPDATE estimates
    SET status = 'expired', updated_at = now()
    WHERE client_id = p_client_id
      AND status = 'sent'
      AND expires_at IS NOT NULL
      AND expires_at < now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_results := jsonb_set(v_results, '{expired_estimates}', to_jsonb(v_count));

    RETURN v_results;
END;
$$;

-- ============================================================
-- Trigger to prevent hard deletes on soft-delete tables
-- (except through the controlled functions above)
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_hard_delete_on_soft_tables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Hard delete not allowed on %. Use soft_delete_record() function.', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
END;
$$;

-- Attach prevention triggers (only for tables with soft delete)
CREATE TRIGGER prevent_hard_delete_clients
    BEFORE DELETE ON clients FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_on_soft_tables();

CREATE TRIGGER prevent_hard_delete_customers
    BEFORE DELETE ON customers FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_on_soft_tables();

CREATE TRIGGER prevent_hard_delete_estimates
    BEFORE DELETE ON estimates FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_on_soft_tables();

CREATE TRIGGER prevent_hard_delete_bookings
    BEFORE DELETE ON bookings FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete_on_soft_tables();

-- ============================================================
-- Partial indexes to exclude soft-deleted records from normal queries
-- ============================================================
-- These were already created in initial schema but ensure they exist
DROP INDEX IF EXISTS idx_customers_client_id;
CREATE INDEX idx_customers_client_id ON customers(client_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_estimates_client_id;
CREATE INDEX idx_estimates_client_id ON estimates(client_id) WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_bookings_client_id;
CREATE INDEX idx_bookings_client_id ON bookings(client_id) WHERE deleted_at IS NULL;

-- ============================================================
-- View for active records only (convenience)
-- ============================================================
CREATE OR REPLACE VIEW active_customers AS
SELECT * FROM customers WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_estimates AS
SELECT * FROM estimates WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW active_bookings AS
SELECT * FROM bookings WHERE deleted_at IS NULL;

-- Grant access to views
GRANT SELECT ON active_customers TO authenticated;
GRANT SELECT ON active_estimates TO authenticated;
GRANT SELECT ON active_bookings TO authenticated;