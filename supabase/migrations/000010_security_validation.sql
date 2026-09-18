-- Migration: 000010_security_validation.sql
-- Description: Security validation functions and checks
-- Depends on: 000001_initial_schema.sql through 000009_harden_functions.sql

-- ============================================================
-- Validation: Check for x-client-id authorization bypass
-- ============================================================
-- Ensure no policies or functions use x-client-id header
DO $$
DECLARE
    v_policy record;
    v_issues text := '';
BEGIN
    -- Check all RLS policies for x-client-id usage
    FOR v_policy IN
        SELECT polname, polrelid::regclass AS table_name, pg_get_expr(polqual, polrelid) AS using_expr
        FROM pg_policy
        WHERE schemaname = 'public'
    LOOP
        IF v_policy.using_expr ILIKE '%x-client-id%' OR
           v_policy.using_expr ILIKE '%request.header%' OR
           v_policy.using_expr ILIKE '%current_setting(''request.jwt%' THEN
            v_issues := v_issues || 'Policy ' || v_policy.polname || ' on ' || v_policy.table_name || ' may use request headers; ';
        END IF;
    END LOOP;

    IF v_issues != '' THEN
        RAISE WARNING 'Potential header-based authorization in policies: %', v_issues;
    END IF;
END;
$$;

-- ============================================================
-- Validation: Ensure no cross-table CHECK/EXISTS constraints
-- ============================================================
DO $$
DECLARE
    v_constraint record;
    v_issues text := '';
BEGIN
    FOR v_constraint IN
        SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE contype = 'c'  -- CHECK constraints
        AND connamespace = 'public'::regnamespace
    LOOP
        -- Check for subqueries or cross-table references
        IF v_constraint.def ILIKE '%SELECT%' OR
           v_constraint.def ILIKE '%EXISTS%' OR
           v_constraint.def ILIKE '%IN (SELECT%' THEN
            v_issues := v_issues || 'Constraint ' || v_constraint.conname || ' on ' || v_constraint.table_name || ' may have cross-table reference; ';
        END IF;
    END LOOP;

    IF v_issues != '' THEN
        RAISE WARNING 'Constraints with potential cross-table references: %', v_issues;
    END IF;
END;
$$;

-- ============================================================
-- Validation: Verify tenant isolation on all tables
-- ============================================================
CREATE OR REPLACE FUNCTION validate_tenant_isolation()
RETURNS TABLE (
    table_name text,
    rls_enabled boolean,
    policy_count integer,
    issues text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tbl record;
    v_policy_count integer;
    v_issues text;
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
        v_issues := '';
        v_policy_count := 0;

        -- Check RLS enabled
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = v_tbl.tablename
            AND n.nspname = 'public'
            AND c.relrowsecurity = true
        ) THEN
            v_issues := v_issues || 'RLS not enabled; ';
        END IF;

        -- Count policies
        SELECT count(*) INTO v_policy_count
        FROM pg_policy
        WHERE polrelid = v_tbl.tablename::regclass;

        IF v_policy_count = 0 THEN
            v_issues := v_issues || 'No RLS policies; ';
        END IF;

        -- Check for USING (true) or overly permissive policies
        FOR v_policy IN
            SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
            FROM pg_policy
            WHERE polrelid = v_tbl.tablename::regclass
        LOOP
            IF v_policy.using_expr = 'true' OR v_policy.using_expr ILIKE '%true%' THEN
                v_issues := v_issues || 'Policy ' || v_policy.polname || ' uses USING (true); ';
            END IF;
        END LOOP;

        RETURN NEXT;
    END LOOP;
END;
$$;

-- ============================================================
-- Validation: Verify worker authorization model
-- ============================================================
CREATE OR REPLACE FUNCTION validate_worker_authorization_model()
RETURNS TABLE (
    check_name text,
    passed boolean,
    details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Check 1: worker_authorizations table exists
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'worker_authorizations') THEN
        RETURN QUERY SELECT 'worker_authorizations table exists', true, 'Table exists with proper schema';
    ELSE
        RETURN QUERY SELECT 'worker_authorizations table exists', false, 'Table missing';
    END IF;

    -- Check 2: worker_authorizations has proper RLS
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'worker_authorizations'
        AND n.nspname = 'public'
        AND c.relrowsecurity = true
    ) THEN
        RETURN QUERY SELECT 'worker_authorizations RLS enabled', true, 'RLS enabled';
    ELSE
        RETURN QUERY SELECT 'worker_authorizations RLS enabled', false, 'RLS not enabled';
    END IF;

    -- Check 3: worker_authorizations has admin-only policies
    IF EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'worker_authorizations'::regclass
        AND polcmd IN ('r', 'a', 'w', 'd')
    ) THEN
        RETURN QUERY SELECT 'worker_authorizations has policies', true, 'Policies exist';
    ELSE
        RETURN QUERY SELECT 'worker_authorizations has policies', false, 'No policies';
    END IF;

    -- Check 4: No service_role shortcuts in worker functions
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE prosrc ILIKE '%service_role%'
        AND pronamespace = 'public'::regnamespace
    ) THEN
        RETURN QUERY SELECT 'No service_role shortcuts in functions', true, 'No service_role usage found';
    ELSE
        RETURN QUERY SELECT 'No service_role shortcuts in functions', false, 'service_role found in functions';
    END IF;
END;
$$;

-- ============================================================
-- Validation: Verify composite FKs for cross-tenant integrity
-- ============================================================
CREATE OR REPLACE FUNCTION validate_composite_fks()
RETURNS TABLE (
    fk_name text,
    table_name text,
    is_composite boolean,
    includes_client_id boolean,
    issues text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fk record;
BEGIN
    FOR v_fk IN
        SELECT
            tc.constraint_name AS fk_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS referenced_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN (
            'customers', 'leads', 'estimates', 'consents', 'conversations',
            'messages', 'bookings', 'actions', 'errors', 'worker_authorizations',
            'client_sops', 'api_usage', 'cost_ledger'
        )
    LOOP
        -- Check if this FK is composite and includes client_id
        RETURN QUERY SELECT
            v_fk.fk_name,
            v_fk.table_name,
            EXISTS (
                SELECT 1 FROM information_schema.key_column_usage kcu2
                WHERE kcu2.constraint_name = v_fk.fk_name
                AND kcu2.column_name = 'client_id'
            ) AS is_composite,
            EXISTS (
                SELECT 1 FROM information_schema.key_column_usage kcu2
                WHERE kcu2.constraint_name = v_fk.fk_name
                AND kcu2.column_name = 'client_id'
            ) AS includes_client_id,
            CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM information_schema.key_column_usage kcu2
                    WHERE kcu2.constraint_name = v_fk.fk_name
                    AND kcu2.column_name = 'client_id'
                ) THEN 'Missing client_id in composite FK'
                ELSE ''
            END AS issues;
    END LOOP;
END;
$$;

-- ============================================================
-- Validation: Verify idempotency constraints
-- ============================================================
CREATE OR REPLACE FUNCTION validate_idempotency_constraints()
RETURNS TABLE (
    table_name text,
    constraint_name text,
    columns text[],
    issues text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_constraint record;
BEGIN
    FOR v_constraint IN
        SELECT
            tc.table_name,
            tc.constraint_name,
            ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('workflow_events', 'actions', 'messages', 'bookings', 'estimates')
        AND (
            tc.constraint_name ILIKE '%idempotency%'
            OR tc.constraint_name ILIKE '%external_message_id%'
            OR tc.constraint_name ILIKE '%estimate_number%'
            OR tc.constraint_name ILIKE '%booking_number%'
        )
        GROUP BY tc.table_name, tc.constraint_name
    LOOP
        RETURN QUERY SELECT
            v_constraint.table_name,
            v_constraint.constraint_name,
            v_constraint.columns,
            CASE
                WHEN v_constraint.table_name = 'workflow_events' AND 'client_id' = ANY(v_constraint.columns) AND 'idempotency_key' = ANY(v_constraint.columns) THEN ''
                WHEN v_constraint.table_name = 'actions' AND 'client_id' = ANY(v_constraint.columns) AND 'idempotency_key' = ANY(v_constraint.columns) THEN ''
                WHEN v_constraint.table_name = 'messages' AND 'client_id' = ANY(v_constraint.columns) AND 'conversation_id' = ANY(v_constraint.columns) AND 'external_message_id' = ANY(v_constraint.columns) THEN ''
                WHEN v_constraint.table_name = 'bookings' AND 'client_id' = ANY(v_constraint.columns) AND 'booking_number' = ANY(v_constraint.columns) THEN ''
                WHEN v_constraint.table_name = 'estimates' AND 'client_id' = ANY(v_constraint.columns) AND 'estimate_number' = ANY(v_constraint.columns) THEN ''
                ELSE 'Unexpected column composition'
            END AS issues;
    END LOOP;
END;
$$;

-- ============================================================
-- Validation: Verify audit log append-only
-- ============================================================
CREATE OR REPLACE FUNCTION validate_audit_log_append_only()
RETURNS TABLE (
    table_name text,
    has_update_policy boolean,
    has_delete_policy boolean,
    issues text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tbl text;
BEGIN
    FOR v_tbl IN SELECT unnest(ARRAY['audit_logs', 'system_audit_logs'])
    LOOP
        RETURN QUERY SELECT
            v_tbl,
            EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_tbl::regclass AND polcmd = 'u'),
            EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_tbl::regclass AND polcmd = 'd'),
            CASE
                WHEN EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_tbl::regclass AND polcmd = 'u') THEN 'UPDATE policy exists - not append-only'
                WHEN EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_tbl::regclass AND polcmd = 'd') THEN 'DELETE policy exists - not append-only'
                ELSE ''
            END;
    END LOOP;
END;
$$;

-- ============================================================
-- Validation: Verify SECURITY DEFINER functions have safe search_path
-- ============================================================
CREATE OR REPLACE FUNCTION validate_security_definer_functions()
RETURNS TABLE (
    function_name text,
    has_safe_search_path boolean,
    issues text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_func record;
BEGIN
    FOR v_func IN
        SELECT proname, proconfig
        FROM pg_proc
        WHERE prokind = 'f'
        AND prosecdef = true
        AND pronamespace = 'public'::regnamespace
    LOOP
        RETURN QUERY SELECT
            v_func.proname,
            v_func.proconfig IS NOT NULL AND EXISTS (
                SELECT 1 FROM unnest(v_func.proconfig) AS cfg
                WHERE cfg ILIKE 'search_path=public,pg_temp'
            ),
            CASE
                WHEN v_func.proconfig IS NULL OR NOT EXISTS (
                    SELECT 1 FROM unnest(v_func.proconfig) AS cfg
                    WHERE cfg ILIKE 'search_path=public,pg_temp'
                ) THEN 'Missing or unsafe search_path'
                ELSE ''
            END;
    END LOOP;
END;
$$;

-- ============================================================
-- Validation: Run all checks
-- ============================================================
CREATE OR REPLACE FUNCTION run_all_validations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_results jsonb := '{}'::jsonb;
BEGIN
    -- Run tenant isolation validation
    v_results := jsonb_set(v_results, '{tenant_isolation}', (
        SELECT jsonb_agg(to_jsonb(t)) FROM validate_tenant_isolation() t
    ));

    -- Run worker authorization validation
    v_results := jsonb_set(v_results, '{worker_authorization}', (
        SELECT jsonb_agg(to_jsonb(t)) FROM validate_worker_authorization_model() t
    ));

    -- Run composite FK validation
    v_results := jsonb_set(v_results, '{composite_fks}', (
        SELECT jsonb_agg(to_jsonb(t)) FROM validate_composite_fks() t
    ));

    -- Run idempotency validation
    v_results := jsonb_set(v_results, '{idempotency}', (
        SELECT jsonb_agg(to_jsonb(t)) FROM validate_idempotency_constraints() t
    ));

    -- Run audit log validation
    v_results := jsonb_set(v_results, '{audit_logs}', (
        SELECT jsonb_agg(to_jsonb(t)) FROM validate_audit_log_append_only() t
    ));

    -- Run SECURITY DEFINER validation
    v_results := jsonb_set(v_results, '{security_definer}', (
        SELECT jsonb_agg(to_jsonb(t)) FROM validate_security_definer_functions() t
    ));

    RETURN v_results;
END;
$$;