-- Migration: 000015_hardening_fixes.sql
-- Description: Production hardening — RLS corrections, migration_history RLS, system_audit_logs tenant enforcement, explicit grants
-- Depends on: 000005_rls_policies.sql, 000011_rollback_hardening.sql, 000012_security_fixes.sql

-- ============================================================
-- 1. Fix RLS SELECT policies: remove deleted_at references
--    for tables that do NOT have a deleted_at column.
--
--    Tables WITH deleted_at:  clients, customers, leads, estimates, bookings
--    Tables WITHOUT deleted_at: consents, conversations, messages,
--      workflow_events, actions, errors, client_sops, api_usage,
--      cost_ledger, opt_out_keywords, client_members, audit_logs,
--      system_audit_logs, worker_authorizations
-- ============================================================

-- Drop the blanket SELECT policies created by 000005's DO loop
-- (these reference deleted_at for ALL tables, which fails for tables without it)
DO $$
DECLARE
    tbl text;
    tables_without_deleted_at text[] := ARRAY[
        'consents', 'conversations', 'messages',
        'workflow_events', 'actions', 'errors',
        'client_sops', 'api_usage', 'cost_ledger'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables_without_deleted_at
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %s_select_tenant ON %s', tbl, tbl);
        EXECUTE format('
            CREATE POLICY %s_select_tenant ON %s
                FOR SELECT
                USING (client_id = get_current_tenant_id());
        ', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================
-- 2. Enable RLS on migration_history (created in 000011 without RLS)
-- ============================================================
ALTER TABLE IF EXISTS migration_history ENABLE ROW LEVEL SECURITY;

-- migration_history is a system table — only service_role needs access.
-- Create a permissive policy for service_role (bypasses RLS by default,
-- but adding the policy makes intent explicit and ensures the table is
-- locked down if RLS is ever enforced for service_role).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'migration_history') THEN
        -- Drop any existing policies to avoid duplicates
        DROP POLICY IF EXISTS migration_history_admin_only ON migration_history;
        -- Service role bypasses RLS, so no explicit INSERT/SELECT policy is needed.
        -- Adding a restrictive policy ensures no authenticated role can access it.
        CREATE POLICY migration_history_admin_only ON migration_history
            FOR ALL
            USING (false);
    END IF;
END $$;

-- ============================================================
-- 3. Enforce tenant context on system_audit_logs INSERT
--    Current policy: WITH CHECK (true) — too permissive
--    Fix: require client_id IS NULL (system event) OR
--         client_id matches tenant context
-- ============================================================
DROP POLICY IF EXISTS system_audit_logs_insert_system ON system_audit_logs;

CREATE POLICY system_audit_logs_insert_tenant ON system_audit_logs
    FOR INSERT
    WITH CHECK (
        client_id IS NULL
        OR client_id = get_current_tenant_id()
    );

-- ============================================================
-- 4. Replace blanket GRANT ALL from 000012 with explicit grants
-- ============================================================

-- Revoke the blanket grants
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Grant explicit permissions for authenticated role:
-- SELECT on business tables (RLS restricts to tenant)
GRANT SELECT ON clients TO authenticated;
GRANT SELECT ON client_members TO authenticated;
GRANT SELECT ON customers TO authenticated;
GRANT SELECT ON leads TO authenticated;
GRANT SELECT ON estimates TO authenticated;
GRANT SELECT ON consents TO authenticated;
GRANT SELECT ON opt_out_keywords TO authenticated;
GRANT SELECT ON conversations TO authenticated;
GRANT SELECT ON messages TO authenticated;
GRANT SELECT ON bookings TO authenticated;
GRANT SELECT ON workflow_events TO authenticated;
GRANT SELECT ON actions TO authenticated;
GRANT SELECT ON errors TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT ON client_sops TO authenticated;
GRANT SELECT ON api_usage TO authenticated;
GRANT SELECT ON cost_ledger TO authenticated;
GRANT SELECT ON worker_authorizations TO authenticated;

-- INSERT/UPDATE on business tables (RLS restricts to tenant)
GRANT INSERT, UPDATE ON customers TO authenticated;
GRANT INSERT, UPDATE ON leads TO authenticated;
GRANT INSERT, UPDATE ON estimates TO authenticated;
GRANT INSERT, UPDATE ON consents TO authenticated;
GRANT INSERT, UPDATE ON opt_out_keywords TO authenticated;
GRANT INSERT, UPDATE ON conversations TO authenticated;
GRANT INSERT, UPDATE ON messages TO authenticated;
GRANT INSERT, UPDATE ON bookings TO authenticated;
GRANT INSERT, UPDATE ON workflow_events TO authenticated;
GRANT INSERT, UPDATE ON actions TO authenticated;
GRANT INSERT, UPDATE ON errors TO authenticated;
GRANT INSERT, UPDATE ON audit_logs TO authenticated;
GRANT INSERT, UPDATE ON client_sops TO authenticated;
GRANT INSERT, UPDATE ON worker_authorizations TO authenticated;

-- Sequences needed for INSERT operations
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Explicitly deny authenticated access to system tables
-- (system_audit_logs, migration_history — these are service_role only)
REVOKE ALL ON system_audit_logs FROM authenticated;
REVOKE ALL ON migration_history FROM authenticated;

-- Functions: only grant execute on user-facing functions
-- Workers use service_role which bypasses RLS
