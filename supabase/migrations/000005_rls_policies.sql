-- Migration: 000005_rls_policies.sql
-- Description: Comprehensive RLS policies with fail-closed behavior
-- Depends on: 000001_initial_schema.sql, 000002_validation_tables.sql, 000003_booking_workflow.sql, 000004_security_core.sql

-- ============================================================
-- RLS Helper: Current tenant context function
-- ============================================================
-- This function must be called within a transaction where tenant context is set
-- Usage: SET LOCAL app.current_tenant_id = 'uuid';
-- Then policies use current_setting('app.current_tenant_id')::uuid

-- Create the configuration parameter
ALTER SYSTEM SET app.current_tenant_id = '';
SELECT pg_reload_conf();

-- ============================================================
-- Enhanced RLS Policies using transaction-scoped tenant context
-- ============================================================

-- Drop basic member policies and replace with tenant-context-aware ones
-- These use the transaction-scoped tenant context for stronger isolation

-- Function to get current tenant context (fail-closed)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- ============================================================
-- Updated RLS Policies using tenant context
-- ============================================================

-- clients: Only allow access to the tenant set in context
DROP POLICY IF EXISTS clients_select_member ON clients;
DROP POLICY IF EXISTS clients_update_admin ON clients;

CREATE POLICY clients_select_tenant ON clients
    FOR SELECT
    USING (
        id = get_current_tenant_id()
    );

CREATE POLICY clients_update_tenant ON clients
    FOR UPDATE
    USING (
        id = get_current_tenant_id()
    )
    WITH CHECK (
        id = get_current_tenant_id()
    );

-- client_members: Tenant-scoped access
DROP POLICY IF EXISTS client_members_select_member ON client_members;
DROP POLICY IF EXISTS client_members_insert_admin ON client_members;
DROP POLICY IF EXISTS client_members_update_admin ON client_members;
DROP POLICY IF EXISTS client_members_delete_admin ON client_members;

CREATE POLICY client_members_select_tenant ON client_members
    FOR SELECT
    USING (
        client_id = get_current_tenant_id()
    );

CREATE POLICY client_members_insert_tenant_admin ON client_members
    FOR INSERT
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.client_id = get_current_tenant_id()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

CREATE POLICY client_members_update_tenant_admin ON client_members
    FOR UPDATE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.client_id = get_current_tenant_id()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.client_id = get_current_tenant_id()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

CREATE POLICY client_members_delete_tenant_admin ON client_members
    FOR DELETE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.client_id = get_current_tenant_id()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- Business tables: All use tenant context
-- ============================================================

-- Helper to drop and recreate policies for a table
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'customers', 'leads', 'estimates', 'consents',
        'conversations', 'messages', 'bookings',
        'workflow_events', 'actions', 'errors',
        'client_sops', 'api_usage', 'cost_ledger'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %s_select_member ON %s', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS %s_insert_member ON %s', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS %s_update_member ON %s', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS %s_delete_member ON %s', tbl, tbl);

        EXECUTE format('
            CREATE POLICY %s_select_tenant ON %s
                FOR SELECT
                USING (client_id = get_current_tenant_id() AND (deleted_at IS NULL OR deleted_at IS NOT NULL));
        ', tbl, tbl);

        EXECUTE format('
            CREATE POLICY %s_insert_tenant ON %s
                FOR INSERT
                WITH CHECK (client_id = get_current_tenant_id());
        ', tbl, tbl);

        EXECUTE format('
            CREATE POLICY %s_update_tenant ON %s
                FOR UPDATE
                USING (client_id = get_current_tenant_id())
                WITH CHECK (client_id = get_current_tenant_id());
        ', tbl, tbl);

        EXECUTE format('
            CREATE POLICY %s_delete_tenant ON %s
                FOR DELETE
                USING (client_id = get_current_tenant_id());
        ', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================
-- opt_out_keywords: Admin-only management
-- ============================================================
DROP POLICY IF EXISTS opt_out_keywords_select_member ON opt_out_keywords;
DROP POLICY IF EXISTS opt_out_keywords_insert_admin ON opt_out_keywords;
DROP POLICY IF EXISTS opt_out_keywords_update_admin ON opt_out_keywords;

CREATE POLICY opt_out_keywords_select_tenant ON opt_out_keywords
    FOR SELECT
    USING (
        client_id = get_current_tenant_id()
    );

CREATE POLICY opt_out_keywords_insert_tenant_admin ON opt_out_keywords
    FOR INSERT
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY opt_out_keywords_update_tenant_admin ON opt_out_keywords
    FOR UPDATE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- worker_authorizations: Admin-only (workers don't manage their own auth)
-- ============================================================
DROP POLICY IF EXISTS worker_authorizations_select_admin ON worker_authorizations;
DROP POLICY IF EXISTS worker_authorizations_insert_admin ON worker_authorizations;
DROP POLICY IF EXISTS worker_authorizations_update_admin ON worker_authorizations;

CREATE POLICY worker_authorizations_select_tenant_admin ON worker_authorizations
    FOR SELECT
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY worker_authorizations_insert_tenant_admin ON worker_authorizations
    FOR INSERT
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY worker_authorizations_update_tenant_admin ON worker_authorizations
    FOR UPDATE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- audit_logs: Append-only (no update/delete)
-- ============================================================
DROP POLICY IF EXISTS audit_logs_select_member ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_system ON audit_logs;

CREATE POLICY audit_logs_select_tenant ON audit_logs
    FOR SELECT
    USING (
        client_id = get_current_tenant_id()
    );

CREATE POLICY audit_logs_insert_tenant ON audit_logs
    FOR INSERT
    WITH CHECK (
        client_id = get_current_tenant_id()
    );

-- NO UPDATE/DELETE policies - append only

-- ============================================================
-- system_audit_logs: Highly restricted
-- ============================================================
DROP POLICY IF EXISTS system_audit_logs_select_admin ON system_audit_logs;
DROP POLICY IF EXISTS system_audit_logs_insert_system ON system_audit_logs;

CREATE POLICY system_audit_logs_select_tenant_admin ON system_audit_logs
    FOR SELECT
    USING (
        (client_id IS NULL AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id IN (SELECT id FROM clients WHERE id = get_current_tenant_id())
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )) OR
        (client_id IS NOT NULL AND client_id = get_current_tenant_id() AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        ))
    );

CREATE POLICY system_audit_logs_insert_system ON system_audit_logs
    FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- Fail-closed: Default deny for all tables
-- ============================================================
-- Tables already have RLS enabled and policies are restrictive by default
-- The policies above only GRANT access when tenant context matches