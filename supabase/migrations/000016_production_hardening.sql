-- Migration: 000016_production_hardening.sql
-- Description: Fix RLS tautology for soft-delete tables, add circuit_breaker_state,
--   add system_config for global kill switch, refine permissions
-- Depends on: 000015_hardening_fixes.sql

-- ============================================================
-- 1. Fix RLS tautology: deleted_at IS NULL OR deleted_at IS NOT NULL
--    is always true. For tables WITH deleted_at, filter to
--    non-deleted rows only (deleted_at IS NULL).
--
--    Tables with deleted_at that are in the 000005 DO loop:
--      customers, estimates, bookings
--    (leads does NOT have deleted_at; clients uses its own policies)
-- ============================================================

DO $$
DECLARE
    tbl text;
    soft_delete_tables text[] := ARRAY['customers', 'estimates', 'bookings'];
BEGIN
    FOREACH tbl IN ARRAY soft_delete_tables
    LOOP
        -- Drop the tautological policy from 000005
        EXECUTE format('DROP POLICY IF EXISTS %s_select_tenant ON %s', tbl, tbl);
        -- Recreate with correct soft-delete filtering
        EXECUTE format('
            CREATE POLICY %s_select_tenant ON %s
                FOR SELECT
                USING (client_id = get_current_tenant_id() AND deleted_at IS NULL);
        ', tbl, tbl);
    END LOOP;
END $$;

-- ============================================================
-- 2. clients table: fix its SELECT policy to also filter soft-deleted
--    (clients has deleted_at but uses its own policies, not the DO loop)
-- ============================================================
DROP POLICY IF EXISTS clients_select_tenant ON clients;
CREATE POLICY clients_select_tenant ON clients
    FOR SELECT
    USING (client_id = get_current_tenant_id() AND deleted_at IS NULL);

-- ============================================================
-- 3. circuit_breaker_state — persistent circuit breaker for workers
-- ============================================================
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    state       TEXT NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_failure_time TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id)
);

ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- Service-role only (workers use service_role)
CREATE POLICY circuit_breaker_state_service_only ON circuit_breaker_state
    FOR ALL
    USING (false);

-- ============================================================
-- 4. system_config — system-wide settings (global kill switch, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Service-role only
CREATE POLICY system_config_service_only ON system_config
    FOR ALL
    USING (false);

-- ============================================================
-- 5. Permissions: least-privilege for new tables
-- ============================================================
-- authenticated has no access to circuit_breaker_state or system_config
-- (workers use service_role which bypasses RLS)

-- Grant SELECT on circuit_breaker_state to authenticated for read-only visibility
-- (optional: remove if workers are the only consumers)
GRANT SELECT ON circuit_breaker_state TO authenticated;

-- system_config: no access for authenticated (system-only)
REVOKE ALL ON system_config FROM authenticated;

-- ============================================================
-- 5b. Restore webhook table grants revoked by 000015
--     000015 REVOKE ALL ON ALL TABLES removed grants from 000013.
--     Re-grant to authenticated role for application-layer access.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON webhook_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ingestion_events TO authenticated;
GRANT SELECT, INSERT ON ingestion_processing_log TO authenticated;

-- ============================================================
-- 6. Indexes for new tables
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state_client
    ON circuit_breaker_state(client_id);

-- ============================================================
-- 7. Audit log
-- ============================================================
INSERT INTO system_audit_logs (action, resource_type, resource_id, metadata)
VALUES (
    'migration_complete',
    'database',
    '000016_production_hardening',
    jsonb_build_object(
        'migrations_applied', 16,
        'timestamp', now(),
        'version', '1.0.0'
    )
);
