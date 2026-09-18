-- Migration: 000012_security_fixes.sql
-- Description: Additional security hardening and fixes (schema validation only)
-- Depends on: 000001_initial_schema.sql through 000011_rollback_hardening.sql

-- ============================================================
-- Fix 1: Prevent function search_path injection via temp schemas
-- ============================================================
-- Ensure all functions explicitly set search_path
DO $$
DECLARE
    v_func record;
BEGIN
    FOR v_func IN
        SELECT proname, proconfig
        FROM pg_proc
        WHERE prokind = 'f'
        AND prosecdef = true
        AND pronamespace = 'public'::regnamespace
        AND (proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(proconfig) AS cfg
            WHERE cfg ILIKE 'search_path=public,pg_temp'
        ))
    LOOP
        RAISE WARNING 'Function % needs search_path hardening', v_func.proname;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 2: Ensure no table has USING (true) policy
-- ============================================================
DO $$
DECLARE
    v_policy record;
    v_count integer := 0;
BEGIN
    FOR v_policy IN
        SELECT polname, polrelid::regclass AS table_name
        FROM pg_policy
        WHERE pg_get_expr(polqual, polrelid) = 'true'
    LOOP
        v_count := v_count + 1;
        RAISE WARNING 'Table % has USING (true) policy: %', v_policy.table_name, v_policy.polname;
    END LOOP;

    IF v_count = 0 THEN
        RAISE NOTICE 'No USING (true) policies found';
    END IF;
END;
$$;

-- ============================================================
-- Fix 3: Ensure all tenant tables have client_id NOT NULL
-- ============================================================
DO $$
DECLARE
    v_col record;
BEGIN
    FOR v_col IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
        AND c.column_name = 'client_id'
        AND c.is_nullable = 'YES'
        AND t.table_name IN (
            'clients', 'client_members', 'customers', 'leads', 'estimates',
            'consents', 'opt_out_keywords', 'conversations', 'messages',
            'bookings', 'workflow_events', 'actions', 'errors',
            'audit_logs', 'system_audit_logs', 'client_sops',
            'api_usage', 'cost_ledger', 'worker_authorizations'
        )
    LOOP
        RAISE WARNING 'Column client_id is nullable on table %', v_col.table_name;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 4: Ensure all timestamps use timestamptz
-- ============================================================
DO $$
DECLARE
    v_col record;
BEGIN
    FOR v_col IN
        SELECT c.table_name, c.column_name, c.data_type
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
        AND c.data_type IN ('timestamp without time zone', 'timestamp')
        AND t.table_name IN (
            'clients', 'client_members', 'customers', 'leads', 'estimates',
            'consents', 'opt_out_keywords', 'conversations', 'messages',
            'bookings', 'workflow_events', 'actions', 'errors',
            'audit_logs', 'system_audit_logs', 'client_sops',
            'api_usage', 'cost_ledger', 'worker_authorizations'
        )
    LOOP
        RAISE WARNING 'Column % on table % uses timestamp without time zone', v_col.column_name, v_col.table_name;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 5: Ensure all primary keys are UUID
-- ============================================================
DO $$
DECLARE
    v_pk record;
BEGIN
    FOR v_pk IN
        SELECT tc.table_name, kcu.column_name, c.data_type
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.columns c
            ON c.table_name = tc.table_name
            AND c.column_name = kcu.column_name
            AND c.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND c.data_type != 'uuid'
    LOOP
        RAISE WARNING 'Table % primary key column % is not UUID (type: %)', v_pk.table_name, v_pk.column_name, v_pk.data_type;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 6: Ensure all foreign keys reference UUID columns
-- ============================================================
DO $$
DECLARE
    v_fk record;
BEGIN
    FOR v_fk IN
        SELECT
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column,
            c.data_type
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        JOIN information_schema.columns c
            ON c.table_name = ccu.table_name
            AND c.column_name = ccu.column_name
            AND c.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND c.data_type != 'uuid'
    LOOP
        RAISE WARNING 'FK % on table % references non-UUID column % on %', v_fk.constraint_name, v_fk.table_name, v_fk.referenced_column, v_fk.referenced_table;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 7: Ensure JSONB columns have NOT NULL DEFAULT '{}'
-- ============================================================
DO $$
DECLARE
    v_col record;
BEGIN
    FOR v_col IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
        AND c.data_type = 'jsonb'
        AND c.is_nullable = 'YES'
        AND c.column_default IS NULL
        AND c.table_name IN (
            'clients', 'client_members', 'customers', 'leads', 'estimates',
            'consents', 'opt_out_keywords', 'conversations', 'messages',
            'bookings', 'workflow_events', 'actions', 'errors',
            'audit_logs', 'system_audit_logs', 'client_sops',
            'api_usage', 'cost_ledger', 'worker_authorizations'
        )
    LOOP
        RAISE WARNING 'JSONB column % on table % is nullable without default', v_col.column_name, v_col.table_name;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 8: Ensure audit_logs and system_audit_logs have no UPDATE/DELETE
-- ============================================================
DO $$
DECLARE
    v_tbl text;
    v_has_update boolean;
    v_has_delete boolean;
BEGIN
    FOR v_tbl IN SELECT unnest(ARRAY['audit_logs', 'system_audit_logs'])
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_policy
            WHERE polrelid = v_tbl::regclass AND polcmd = 'u'
        ) INTO v_has_update;

        SELECT EXISTS (
            SELECT 1 FROM pg_policy
            WHERE polrelid = v_tbl::regclass AND polcmd = 'd'
        ) INTO v_has_delete;

        IF v_has_update OR v_has_delete THEN
            RAISE WARNING 'Table % has UPDATE or DELETE policies - not append-only', v_tbl;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 9: Ensure worker_authorizations only manageable by admins
-- ============================================================
DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
        FROM pg_policy
        WHERE polrelid = 'worker_authorizations'::regclass
    LOOP
        IF v_policy.using_expr NOT ILIKE '%role IN (''owner'', ''admin'')%' THEN
            RAISE WARNING 'Policy % on worker_authorizations may allow non-admin access', v_policy.polname;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 10: Ensure opt_out_keywords only manageable by admins
-- ============================================================
DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
        FROM pg_policy
        WHERE polrelid = 'opt_out_keywords'::regclass
        AND polcmd IN ('a', 'w', 'd')
    LOOP
        IF v_policy.using_expr NOT ILIKE '%role IN (''owner'', ''admin'')%' THEN
            RAISE WARNING 'Policy % on opt_out_keywords may allow non-admin write access', v_policy.polname;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 11: Ensure client_sops only manageable by admins
-- ============================================================
DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
        FROM pg_policy
        WHERE polrelid = 'client_sops'::regclass
        AND polcmd IN ('a', 'w', 'd')
    LOOP
        IF v_policy.using_expr NOT ILIKE '%role IN (''owner'', ''admin'')%' THEN
            RAISE WARNING 'Policy % on client_sops may allow non-admin write access', v_policy.polname;
        END IF;
    END LOOP;
END;
$$;

-- ============================================================
-- Fix 12: Add missing indexes for common query patterns
-- ============================================================
-- Workflow events: processed + created_at for queue processing
CREATE INDEX IF NOT EXISTS idx_workflow_events_processed_created
    ON workflow_events(client_id, processed, created_at)
    WHERE processed = false;

-- Actions: worker_type + status for worker queries
CREATE INDEX IF NOT EXISTS idx_actions_worker_status
    ON actions(client_id, worker_type, status);

-- Messages: conversation_id + created_at for history
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at);

-- Bookings: scheduled_at for scheduling
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_client
    ON bookings(client_id, scheduled_at)
    WHERE status IN ('scheduled', 'confirmed');

-- Leads: status + created_at for pipeline
CREATE INDEX IF NOT EXISTS idx_leads_status_created
    ON leads(client_id, status, created_at);

-- Estimates: status + expires_at for expiration processing
CREATE INDEX IF NOT EXISTS idx_estimates_status_expires
    ON estimates(client_id, status, expires_at)
    WHERE status IN ('sent', 'viewed');

-- ============================================================
-- Fix 13: Ensure all tables have proper GRANTs
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================
-- Fix 14: Final security audit log entry
-- ============================================================
INSERT INTO system_audit_logs (actor_type, action, resource_type, resource_id, metadata)
VALUES (
    'system',
    'migration_complete',
    'database',
    NULL,
    jsonb_build_object(
        'migration', '000012_security_fixes',
        'migrations_applied', 12,
        'timestamp', now(),
        'version', '1.0.0'
    )
);