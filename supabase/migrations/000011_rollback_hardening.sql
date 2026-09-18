-- Migration: 000011_rollback_hardening.sql
-- Description: Rollback strategy and migration reversal safety
-- Depends on: 000001_initial_schema.sql through 000010_security_validation.sql

-- ============================================================
-- Rollback Strategy: Each migration is self-contained and reversible
-- ============================================================

-- This migration documents the rollback procedures and provides
-- safe reversal functions. It does NOT execute rollbacks automatically.

-- ============================================================
-- Rollback Functions for Each Migration
-- ============================================================

-- Migration 000001 rollback
CREATE OR REPLACE FUNCTION rollback_000001_initial_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop triggers
    DROP TRIGGER IF EXISTS clients_updated_at ON clients;
    DROP TRIGGER IF EXISTS client_members_updated_at ON client_members;
    DROP TRIGGER IF EXISTS customers_updated_at ON customers;
    DROP TRIGGER IF EXISTS leads_updated_at ON leads;
    DROP TRIGGER IF EXISTS estimates_updated_at ON estimates;

    -- Drop RLS policies
    DROP POLICY IF EXISTS clients_select_tenant ON clients;
    DROP POLICY IF EXISTS clients_update_tenant ON clients;
    DROP POLICY IF EXISTS client_members_select_tenant ON client_members;
    DROP POLICY IF EXISTS client_members_insert_tenant_admin ON client_members;
    DROP POLICY IF EXISTS client_members_update_tenant_admin ON client_members;
    DROP POLICY IF EXISTS client_members_delete_tenant_admin ON client_members;
    DROP POLICY IF EXISTS customers_select_tenant ON customers;
    DROP POLICY IF EXISTS customers_insert_tenant ON customers;
    DROP POLICY IF EXISTS customers_update_tenant ON customers;
    DROP POLICY IF EXISTS customers_delete_tenant ON customers;
    DROP POLICY IF EXISTS leads_select_tenant ON leads;
    DROP POLICY IF EXISTS leads_insert_tenant ON leads;
    DROP POLICY IF EXISTS leads_update_tenant ON leads;
    DROP POLICY IF EXISTS leads_delete_tenant ON leads;
    DROP POLICY IF EXISTS estimates_select_tenant ON estimates;
    DROP POLICY IF EXISTS estimates_insert_tenant ON estimates;
    DROP POLICY IF EXISTS estimates_update_tenant ON estimates;
    DROP POLICY IF EXISTS estimates_delete_tenant ON estimates;

    -- Drop functions
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP FUNCTION IF EXISTS get_current_tenant_id();
    DROP FUNCTION IF EXISTS assert_tenant_context();

    -- Drop tables (CASCADE will remove dependent objects)
    DROP TABLE IF EXISTS estimates CASCADE;
    DROP TABLE IF EXISTS leads CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    DROP TABLE IF EXISTS client_members CASCADE;
    DROP TABLE IF EXISTS clients CASCADE;

    -- Drop view
    DROP VIEW IF EXISTS active_customers;
    DROP VIEW IF EXISTS active_leads;
    DROP VIEW IF EXISTS active_estimates;
    DROP VIEW IF EXISTS active_bookings;

    -- Reset app config
    ALTER SYSTEM SET app.current_tenant_id = '';
    SELECT pg_reload_conf();
END;
$$;

-- Migration 000002 rollback
CREATE OR REPLACE FUNCTION rollback_000002_validation_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop triggers
    DROP TRIGGER IF EXISTS consents_updated_at ON consents;
    DROP TRIGGER IF EXISTS opt_out_keywords_updated_at ON opt_out_keywords;
    DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
    DROP TRIGGER IF EXISTS messages_updated_at ON messages;

    -- Drop RLS policies
    DROP POLICY IF EXISTS consents_select_tenant ON consents;
    DROP POLICY IF EXISTS consents_insert_tenant ON consents;
    DROP POLICY IF EXISTS consents_update_tenant ON consents;
    DROP POLICY IF EXISTS opt_out_keywords_select_tenant ON opt_out_keywords;
    DROP POLICY IF EXISTS opt_out_keywords_insert_tenant_admin ON opt_out_keywords;
    DROP POLICY IF EXISTS opt_out_keywords_update_tenant_admin ON opt_out_keywords;
    DROP POLICY IF EXISTS conversations_select_tenant ON conversations;
    DROP POLICY IF EXISTS conversations_insert_tenant ON conversations;
    DROP POLICY IF EXISTS conversations_update_tenant ON conversations;
    DROP POLICY IF EXISTS messages_select_tenant ON messages;
    DROP POLICY IF EXISTS messages_insert_tenant ON messages;
    DROP POLICY IF EXISTS messages_update_tenant ON messages;

    -- Drop functions
    DROP FUNCTION IF EXISTS insert_workflow_event(uuid, text, text, text, jsonb, jsonb);
    DROP FUNCTION IF EXISTS insert_action(uuid, text, text, text, jsonb, text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, jsonb);
    DROP FUNCTION IF EXISTS insert_message(uuid, uuid, uuid, text, text, text, text, text, timestamptz, jsonb);

    -- Drop tables
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS conversations CASCADE;
    DROP TABLE IF EXISTS opt_out_keywords CASCADE;
    DROP TABLE IF EXISTS consents CASCADE;
END;
$$;

-- Migration 000003 rollback
CREATE OR REPLACE FUNCTION rollback_000003_booking_workflow()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop triggers
    DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
    DROP TRIGGER IF EXISTS workflow_events_updated_at ON workflow_events;
    DROP TRIGGER IF EXISTS actions_updated_at ON actions;

    -- Drop RLS policies
    DROP POLICY IF EXISTS bookings_select_tenant ON bookings;
    DROP POLICY IF EXISTS bookings_insert_tenant ON bookings;
    DROP POLICY IF EXISTS bookings_update_tenant ON bookings;
    DROP POLICY IF EXISTS bookings_delete_tenant ON bookings;
    DROP POLICY IF EXISTS workflow_events_select_tenant ON workflow_events;
    DROP POLICY IF EXISTS workflow_events_insert_system ON workflow_events;
    DROP POLICY IF EXISTS workflow_events_update_system ON workflow_events;
    DROP POLICY IF EXISTS actions_select_tenant ON actions;
    DROP POLICY IF EXISTS actions_insert_worker ON actions;
    DROP POLICY IF EXISTS actions_update_worker ON actions;

    -- Drop functions
    DROP FUNCTION IF EXISTS transition_action_status(uuid, text, uuid, jsonb, text);
    DROP FUNCTION IF EXISTS mark_workflow_event_processing(uuid);
    DROP FUNCTION IF EXISTS mark_workflow_event_failed(uuid, text);
    DROP FUNCTION IF EXISTS acquire_idempotency_lock(text, integer);

    -- Drop tables
    DROP TABLE IF EXISTS actions CASCADE;
    DROP TABLE IF EXISTS workflow_events CASCADE;
    DROP TABLE IF EXISTS bookings CASCADE;

    -- Drop view
    DROP VIEW IF EXISTS idempotency_key_usage;
END;
$$;

-- Migration 000004 rollback
CREATE OR REPLACE FUNCTION rollback_000004_security_core()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop triggers
    DROP TRIGGER IF EXISTS errors_updated_at ON errors;
    DROP TRIGGER IF EXISTS client_sops_updated_at ON client_sops;
    DROP TRIGGER IF EXISTS worker_authorizations_updated_at ON worker_authorizations;

    -- Drop RLS policies
    DROP POLICY IF EXISTS errors_select_tenant ON errors;
    DROP POLICY IF EXISTS errors_insert_system ON errors;
    DROP POLICY IF EXISTS errors_update_tenant ON errors;
    DROP POLICY IF EXISTS audit_logs_select_tenant ON audit_logs;
    DROP POLICY IF EXISTS audit_logs_insert_tenant ON audit_logs;
    DROP POLICY IF EXISTS system_audit_logs_select_tenant_admin ON system_audit_logs;
    DROP POLICY IF EXISTS system_audit_logs_insert_system ON system_audit_logs;
    DROP POLICY IF EXISTS client_sops_select_tenant ON client_sops;
    DROP POLICY IF EXISTS client_sops_insert_tenant_admin ON client_sops;
    DROP POLICY IF EXISTS client_sops_update_tenant_admin ON client_sops;
    DROP POLICY IF EXISTS api_usage_select_tenant ON api_usage;
    DROP POLICY IF EXISTS api_usage_insert_system ON api_usage;
    DROP POLICY IF EXISTS cost_ledger_select_tenant ON cost_ledger;
    DROP POLICY IF EXISTS cost_ledger_insert_system ON cost_ledger;
    DROP POLICY IF EXISTS worker_authorizations_select_tenant_admin ON worker_authorizations;
    DROP POLICY IF EXISTS worker_authorizations_insert_tenant_admin ON worker_authorizations;
    DROP POLICY IF EXISTS worker_authorizations_update_tenant_admin ON worker_authorizations;

    -- Drop tables
    DROP TABLE IF EXISTS worker_authorizations CASCADE;
    DROP TABLE IF EXISTS cost_ledger CASCADE;
    DROP TABLE IF EXISTS api_usage CASCADE;
    DROP TABLE IF EXISTS client_sops CASCADE;
    DROP TABLE IF EXISTS system_audit_logs CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS errors CASCADE;

    -- Drop views
    DROP VIEW IF EXISTS idempotency_key_usage;
END;
$$;

-- Migration 000005 rollback
CREATE OR REPLACE FUNCTION rollback_000005_rls_policies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- This migration only modifies RLS policies
    -- The rollback functions in other migrations handle policy drops
    -- No additional cleanup needed here
    RAISE NOTICE 'RLS policies rolled back by dependent migration rollbacks';
END;
$$;

-- Migration 000006 rollback
CREATE OR REPLACE FUNCTION rollback_000006_cross_tenant_fks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_constraint record;
BEGIN
    -- Drop all composite FKs added by this migration
    FOR v_constraint IN
        SELECT conname, conrelid::regclass AS table_name
        FROM pg_constraint
        WHERE contype = 'f'
        AND connamespace = 'public'::regnamespace
        AND conname LIKE '%_fk'
        AND conname IN (
            'leads_customer_id_fk', 'estimates_customer_id_fk', 'estimates_lead_id_fk',
            'consents_customer_id_fk', 'conversations_customer_id_fk',
            'conversations_estimate_id_fk', 'conversations_lead_id_fk',
            'messages_conversation_id_fk', 'messages_customer_id_fk',
            'bookings_customer_id_fk', 'bookings_estimate_id_fk',
            'bookings_lead_id_fk', 'bookings_conversation_id_fk',
            'actions_customer_id_fk', 'actions_lead_id_fk',
            'actions_estimate_id_fk', 'actions_conversation_id_fk',
            'actions_booking_id_fk', 'actions_workflow_event_id_fk',
            'errors_workflow_event_id_fk', 'errors_action_id_fk'
        )
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', v_constraint.table_name, v_constraint.conname);
    END LOOP;

    -- Drop unique constraints on (client_id, id)
    DROP INDEX IF EXISTS customers_client_id_id_unique;
    DROP INDEX IF EXISTS leads_client_id_id_unique;
    DROP INDEX IF EXISTS estimates_client_id_id_unique;
    DROP INDEX IF EXISTS conversations_client_id_id_unique;
    DROP INDEX IF EXISTS bookings_client_id_id_unique;
    DROP INDEX IF EXISTS workflow_events_client_id_id_unique;
    DROP INDEX IF EXISTS actions_client_id_id_unique;

    -- Drop indexes
    DROP INDEX IF EXISTS idx_leads_client_customer;
    DROP INDEX IF EXISTS idx_estimates_client_customer;
    DROP INDEX IF EXISTS idx_estimates_client_lead;
    DROP INDEX IF EXISTS idx_consents_client_customer;
    DROP INDEX IF EXISTS idx_conversations_client_customer;
    DROP INDEX IF EXISTS idx_conversations_client_estimate;
    DROP INDEX IF EXISTS idx_conversations_client_lead;
    DROP INDEX IF EXISTS idx_messages_client_conversation;
    DROP INDEX IF EXISTS idx_messages_client_customer;
    DROP INDEX IF EXISTS idx_bookings_client_customer;
    DROP INDEX IF EXISTS idx_bookings_client_estimate;
    DROP INDEX IF EXISTS idx_bookings_client_lead;
    DROP INDEX IF EXISTS idx_bookings_client_conversation;
    DROP INDEX IF EXISTS idx_actions_client_customer;
    DROP INDEX IF EXISTS idx_actions_client_lead;
    DROP INDEX IF EXISTS idx_actions_client_estimate;
    DROP INDEX IF EXISTS idx_actions_client_conversation;
    DROP INDEX IF EXISTS idx_actions_client_booking;
    DROP INDEX IF EXISTS idx_actions_client_workflow;
    DROP INDEX IF EXISTS idx_errors_client_workflow;
    DROP INDEX IF EXISTS idx_errors_client_action;
END;
$$;

-- Migration 000007 rollback
CREATE OR REPLACE FUNCTION rollback_000007_soft_delete_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop triggers
    DROP TRIGGER IF EXISTS prevent_hard_delete_clients ON clients;
    DROP TRIGGER IF EXISTS prevent_hard_delete_customers ON customers;
    DROP TRIGGER IF EXISTS prevent_hard_delete_estimates ON estimates;
    DROP TRIGGER IF EXISTS prevent_hard_delete_bookings ON bookings;

    -- Drop functions
    DROP FUNCTION IF EXISTS soft_delete_record(text, uuid, uuid);
    DROP FUNCTION IF EXISTS restore_soft_deleted_record(text, uuid, uuid);
    DROP FUNCTION IF EXISTS hard_delete_client(uuid);
    DROP FUNCTION IF EXISTS cleanup_expired_records(uuid);

    -- Drop views
    DROP VIEW IF EXISTS active_customers;
    DROP VIEW IF EXISTS active_estimates;
    DROP VIEW IF EXISTS active_bookings;
END;
$$;

-- Migration 000008 rollback
CREATE OR REPLACE FUNCTION rollback_000008_action_idempotency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop functions
    DROP FUNCTION IF EXISTS insert_workflow_event(uuid, text, text, text, jsonb, jsonb);
    DROP FUNCTION IF EXISTS insert_action(uuid, text, text, text, jsonb, text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, jsonb);
    DROP FUNCTION IF EXISTS insert_message(uuid, uuid, uuid, text, text, text, text, text, timestamptz, jsonb);
    DROP FUNCTION IF EXISTS acquire_idempotency_lock(text, integer);
    DROP FUNCTION IF EXISTS transition_action_status(uuid, text, uuid, jsonb, text);
    DROP FUNCTION IF EXISTS mark_workflow_event_processing(uuid);
    DROP FUNCTION IF EXISTS mark_workflow_event_failed(uuid, text);

    -- Drop view
    DROP VIEW IF EXISTS idempotency_key_usage;
END;
$$;

-- Migration 000009 rollback
CREATE OR REPLACE FUNCTION rollback_000009_harden_functions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop functions (no event triggers in this migration anymore)
    DROP FUNCTION IF EXISTS assert_tenant_context();

    -- Restore default privileges
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT CREATE ON SCHEMA public TO PUBLIC;
END;
$$;

-- Migration 000010 rollback
CREATE OR REPLACE FUNCTION rollback_000010_security_validation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Drop validation functions
    DROP FUNCTION IF EXISTS validate_tenant_isolation();
    DROP FUNCTION IF EXISTS validate_worker_authorization_model();
    DROP FUNCTION IF EXISTS validate_composite_fks();
    DROP FUNCTION IF EXISTS validate_idempotency_constraints();
    DROP FUNCTION IF EXISTS validate_audit_log_append_only();
    DROP FUNCTION IF EXISTS validate_security_definer_functions();
    DROP FUNCTION IF EXISTS run_all_validations();
END;
$$;

-- ============================================================
-- Master Rollback Function (call with caution)
-- ============================================================
CREATE OR REPLACE FUNCTION rollback_all_migrations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE NOTICE 'Rolling back all migrations in reverse order...';

    PERFORM rollback_000010_security_validation();
    RAISE NOTICE 'Rolled back 000010';

    PERFORM rollback_000009_harden_functions();
    RAISE NOTICE 'Rolled back 000009';

    PERFORM rollback_000008_action_idempotency();
    RAISE NOTICE 'Rolled back 000008';

    PERFORM rollback_000007_soft_delete_cleanup();
    RAISE NOTICE 'Rolled back 000007';

    PERFORM rollback_000006_cross_tenant_fks();
    RAISE NOTICE 'Rolled back 000006';

    PERFORM rollback_000005_rls_policies();
    RAISE NOTICE 'Rolled back 000005';

    PERFORM rollback_000004_security_core();
    RAISE NOTICE 'Rolled back 000004';

    PERFORM rollback_000003_booking_workflow();
    RAISE NOTICE 'Rolled back 000003';

    PERFORM rollback_000002_validation_tables();
    RAISE NOTICE 'Rolled back 000002';

    PERFORM rollback_000001_initial_schema();
    RAISE NOTICE 'Rolled back 000001';

    RAISE NOTICE 'All migrations rolled back successfully';
END;
$$;

-- ============================================================
-- Migration Status Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_history (
    id serial PRIMARY KEY,
    migration_name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    rolled_back_at timestamptz,
    success boolean NOT NULL DEFAULT true,
    error_message text
);

CREATE UNIQUE INDEX idx_migration_history_name ON migration_history(migration_name);

-- ============================================================
-- Migration Apply Tracking Function
-- ============================================================
CREATE OR REPLACE FUNCTION record_migration_applied(p_migration_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO migration_history (migration_name, applied_at, success)
    VALUES (p_migration_name, now(), true)
    ON CONFLICT (migration_name) DO UPDATE SET
        applied_at = now(),
        success = true,
        error_message = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION record_migration_rolled_back(p_migration_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE migration_history
    SET rolled_back_at = now(), success = false
    WHERE migration_name = p_migration_name;
END;
$$;

-- ============================================================
-- Verification: Migration Order Consistency
-- ============================================================
DO $$
DECLARE
    v_migrations text[] := ARRAY[
        '000001_initial_schema',
        '000002_validation_tables',
        '000003_booking_workflow',
        '000004_security_core',
        '000005_rls_policies',
        '000006_cross_tenant_fks',
        '000007_soft_delete_cleanup',
        '000008_action_idempotency',
        '000009_harden_functions',
        '000010_security_validation',
        '000011_rollback_hardening'
    ];
    v_missing text[];
BEGIN
    -- Check that all rollback functions exist
    FOR i IN 1..array_length(v_migrations, 1) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = 'rollback_' || v_migrations[i]
            AND pronamespace = 'public'::regnamespace
        ) THEN
            v_missing := v_missing || v_migrations[i];
        END IF;
    END LOOP;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE WARNING 'Missing rollback functions for: %', array_to_string(v_missing, ', ');
    ELSE
        RAISE NOTICE 'All rollback functions present for all migrations';
    END IF;
END;
$$;