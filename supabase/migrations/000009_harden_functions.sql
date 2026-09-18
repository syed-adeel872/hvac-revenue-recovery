-- Migration: 000009_harden_functions.sql
-- Description: SECURITY DEFINER functions with safe search_path
-- Depends on: 000001_initial_schema.sql through 000008_action_idempotency.sql

-- ============================================================
-- Security: Ensure all SECURITY DEFINER functions have safe search_path
-- ============================================================
-- All functions created so far use: SET search_path = public, pg_temp
-- This prevents search_path injection attacks

-- ============================================================
-- Audit: Verify all SECURITY DEFINER functions
-- ============================================================
DO $$
DECLARE
    v_func record;
    v_issues text := '';
BEGIN
    FOR v_func IN
        SELECT proname, prosrc, proconfig
        FROM pg_proc
        WHERE prokind = 'f'
        AND prosecdef = true
        AND pronamespace = 'public'::regnamespace
    LOOP
        -- Check if search_path is set to safe value
        IF v_func.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_func.proconfig) AS cfg
            WHERE cfg ILIKE 'search_path=public,pg_temp'
        ) THEN
            v_issues := v_issues || 'Function ' || v_func.proname || ' missing safe search_path; ';
        END IF;
    END LOOP;

    IF v_issues != '' THEN
        RAISE NOTICE 'SECURITY DEFINER functions needing review: %', v_issues;
    ELSE
        RAISE NOTICE 'All SECURITY DEFINER functions have safe search_path';
    END IF;
END;
$$;

-- ============================================================
-- Harden: set_updated_at function (already secure)
-- ============================================================
-- Already defined with SECURITY DEFINER and SET search_path = public, pg_temp

-- ============================================================
-- Harden: get_current_tenant_id function (already secure)
-- ============================================================

-- ============================================================
-- Harden: soft_delete_record, restore_soft_deleted_record (already secure)
-- ============================================================

-- ============================================================
-- Harden: hard_delete_client (already secure)
-- ============================================================

-- ============================================================
-- Harden: cleanup_expired_records (already secure)
-- ============================================================

-- ============================================================
-- Harden: insert_workflow_event (already secure)
-- ============================================================

-- ============================================================
-- Harden: insert_action (already secure)
-- ============================================================

-- ============================================================
-- Harden: insert_message (already secure)
-- ============================================================

-- ============================================================
-- Harden: acquire_idempotency_lock (already secure)
-- ============================================================

-- ============================================================
-- Harden: transition_action_status (already secure)
-- ============================================================

-- ============================================================
-- Harden: mark_workflow_event_processing/failed (already secure)
-- ============================================================

-- ============================================================
-- Harden: Revoke public schema default privileges
-- ============================================================
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ============================================================
-- Harden: Ensure RLS is enabled on all tenant tables
-- ============================================================
DO $$
DECLARE
    v_tbl record;
BEGIN
    FOR v_tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN (
            'clients', 'client_members', 'customers', 'leads', 'estimates',
            'consents', 'opt_out_keywords', 'conversations', 'messages',
            'bookings', 'workflow_events', 'actions', 'errors',
            'audit_logs', 'system_audit_logs', 'client_sops',
            'api_usage', 'cost_ledger', 'worker_authorizations'
        )
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_tbl.tablename);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_tbl.tablename);
    END LOOP;
END;
$$;

-- ============================================================
-- Harden: Ensure no public access to sensitive tables
-- ============================================================
REVOKE ALL ON clients, client_members, customers, leads, estimates,
    consents, opt_out_keywords, conversations, messages,
    bookings, workflow_events, actions, errors,
    audit_logs, system_audit_logs, client_sops,
    api_usage, cost_ledger, worker_authorizations
FROM PUBLIC;

-- Grant only necessary permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON clients, client_members, customers, leads, estimates,
    consents, opt_out_keywords, conversations, messages,
    bookings, workflow_events, actions, errors,
    client_sops, api_usage, cost_ledger, worker_authorizations
TO authenticated;

GRANT SELECT, INSERT ON audit_logs, system_audit_logs TO authenticated;

-- ============================================================
-- Harden: Set default privileges for future objects
-- ============================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- ============================================================
-- Harden: Function to validate tenant context is set
-- ============================================================
CREATE OR REPLACE FUNCTION assert_tenant_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF get_current_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'Tenant context not set. Use SET LOCAL app.current_tenant_id = ''client-uuid'';';
    END IF;
END;
$$;