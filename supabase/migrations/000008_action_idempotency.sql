-- Migration: 000008_action_idempotency.sql
-- Description: Idempotency mechanisms for workflow_events and actions
-- Depends on: 000001_initial_schema.sql, 000002_validation_tables.sql, 000003_booking_workflow.sql, 000004_security_core.sql, 000005_rls_policies.sql, 000006_cross_tenant_fks.sql, 000007_soft_delete_cleanup.sql

-- ============================================================
-- Idempotency: workflow_events
-- ============================================================
-- Already has: UNIQUE (client_id, idempotency_key)
-- This ensures duplicate events from same source are rejected at DB level

-- Function to safely insert workflow event with idempotency
CREATE OR REPLACE FUNCTION insert_workflow_event(
    p_client_id uuid,
    p_event_type text,
    p_event_source text,
    p_idempotency_key text,
    p_payload jsonb DEFAULT '{}',
    p_metadata jsonb DEFAULT '{}'
)
RETURNS workflow_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event workflow_events;
BEGIN
    -- Verify tenant context
    IF get_current_tenant_id() IS NULL OR get_current_tenant_id() != p_client_id THEN
        RAISE EXCEPTION 'Tenant context mismatch or not set';
    END IF;

    -- Try to insert (will fail on duplicate idempotency_key)
    INSERT INTO workflow_events (
        client_id, event_type, event_source, idempotency_key, payload, metadata
    ) VALUES (
        p_client_id, p_event_type, p_event_source, p_idempotency_key, p_payload, p_metadata
    )
    ON CONFLICT (client_id, idempotency_key) DO NOTHING
    RETURNING * INTO v_event;

    -- If duplicate, return existing event
    IF v_event IS NULL THEN
        SELECT * INTO v_event
        FROM workflow_events
        WHERE client_id = p_client_id AND idempotency_key = p_idempotency_key;
    END IF;

    RETURN v_event;
END;
$$;

-- ============================================================
-- Idempotency: actions
-- ============================================================
-- Already has: UNIQUE (client_id, idempotency_key) where idempotency_key IS NOT NULL

-- Function to safely insert action with idempotency
CREATE OR REPLACE FUNCTION insert_action(
    p_client_id uuid,
    p_worker_type text,
    p_action_type text,
    p_risk_level text DEFAULT 'green',
    p_input jsonb DEFAULT '{}',
    p_idempotency_key text DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL,
    p_lead_id uuid DEFAULT NULL,
    p_estimate_id uuid DEFAULT NULL,
    p_conversation_id uuid DEFAULT NULL,
    p_booking_id uuid DEFAULT NULL,
    p_workflow_event_id uuid DEFAULT NULL,
    p_approval_required boolean DEFAULT false,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action actions;
    v_approval_required boolean := p_approval_required;
BEGIN
    -- Verify tenant context
    IF get_current_tenant_id() IS NULL OR get_current_tenant_id() != p_client_id THEN
        RAISE EXCEPTION 'Tenant context mismatch or not set';
    END IF;

    -- Determine if approval is required based on risk level
    IF p_risk_level IN ('yellow', 'red') THEN
        v_approval_required := true;
    END IF;

    -- Try to insert
    INSERT INTO actions (
        client_id, worker_type, action_type, risk_level,
        input, idempotency_key, customer_id, lead_id, estimate_id,
        conversation_id, booking_id, workflow_event_id,
        approval_required, metadata
    ) VALUES (
        p_client_id, p_worker_type, p_action_type, p_risk_level,
        p_input, p_idempotency_key, p_customer_id, p_lead_id, p_estimate_id,
        p_conversation_id, p_booking_id, p_workflow_event_id,
        v_approval_required, p_metadata
    )
    ON CONFLICT (client_id, idempotency_key) DO NOTHING
    RETURNING * INTO v_action;

    -- If duplicate, return existing action
    IF v_action IS NULL AND p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_action
        FROM actions
        WHERE client_id = p_client_id AND idempotency_key = p_idempotency_key;
    ELSIF v_action IS NULL THEN
        -- No idempotency key provided, return the newly inserted row
        -- This shouldn't happen as we just inserted it
        SELECT * INTO v_action
        FROM actions
        WHERE id = (SELECT max(id) FROM actions WHERE client_id = p_client_id);
    END IF;

    RETURN v_action;
END;
$$;

-- ============================================================
-- Idempotency: messages (provider/application level)
-- ============================================================
-- Already has: UNIQUE (client_id, conversation_id, external_message_id)

-- Function to safely insert message with provider idempotency
CREATE OR REPLACE FUNCTION insert_message(
    p_client_id uuid,
    p_conversation_id uuid,
    p_customer_id uuid,
    p_direction text,
    p_channel text,
    p_content text,
    p_external_message_id text DEFAULT NULL,
    p_status text DEFAULT 'pending',
    p_sent_at timestamptz DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_message messages;
BEGIN
    -- Verify tenant context
    IF get_current_tenant_id() IS NULL OR get_current_tenant_id() != p_client_id THEN
        RAISE EXCEPTION 'Tenant context mismatch or not set';
    END IF;

    INSERT INTO messages (
        client_id, conversation_id, customer_id, direction,
        channel, content, external_message_id, status, sent_at, metadata
    ) VALUES (
        p_client_id, p_conversation_id, p_customer_id, p_direction,
        p_channel, p_content, p_external_message_id, p_status, p_sent_at, p_metadata
    )
    ON CONFLICT (client_id, conversation_id, external_message_id) DO NOTHING
    RETURNING * INTO v_message;

    IF v_message IS NULL AND p_external_message_id IS NOT NULL THEN
        SELECT * INTO v_message
        FROM messages
        WHERE client_id = p_client_id
          AND conversation_id = p_conversation_id
          AND external_message_id = p_external_message_id;
    ELSIF v_message IS NULL THEN
        SELECT * INTO v_message
        FROM messages
        WHERE id = (SELECT max(id) FROM messages WHERE client_id = p_client_id);
    END IF;

    RETURN v_message;
END;
$$;

-- ============================================================
-- Idempotency: bookings
-- ============================================================
-- Already has: UNIQUE (client_id, booking_number) and UNIQUE (client_id, external_id)

-- ============================================================
-- Idempotency: estimates
-- ============================================================
-- Already has: UNIQUE (client_id, estimate_number) and UNIQUE (client_id, external_id)

-- ============================================================
-- Concurrent Duplicate Protection: Advisory Lock Helper
-- ============================================================
-- For complex operations that need application-level locking
CREATE OR REPLACE FUNCTION acquire_idempotency_lock(
    p_lock_key text,
    p_timeout_ms integer DEFAULT 5000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lock_id bigint := hashtext(p_lock_key);
    v_result boolean;
BEGIN
    -- Try to acquire advisory lock
    v_result := pg_try_advisory_xact_lock(v_lock_id);

    IF NOT v_result THEN
        -- Wait for lock with timeout
        PERFORM pg_sleep(p_timeout_ms / 1000.0);
        v_result := pg_try_advisory_xact_lock(v_lock_id);
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================================
-- Action Status Transition Helper (ensures valid transitions)
-- ============================================================
CREATE OR REPLACE FUNCTION transition_action_status(
    p_action_id uuid,
    p_new_status text,
    p_worker_id uuid DEFAULT NULL,
    p_output jsonb DEFAULT NULL,
    p_error_message text DEFAULT NULL
)
RETURNS actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action actions;
    v_current_status text;
    v_valid_transition boolean := false;
BEGIN
    -- Verify tenant context
    IF get_current_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'Tenant context not set';
    END IF;

    -- Get current action
    SELECT * INTO v_action
    FROM actions
    WHERE id = p_action_id AND client_id = get_current_tenant_id();

    IF v_action IS NULL THEN
        RAISE EXCEPTION 'Action not found or tenant mismatch';
    END IF;

    v_current_status := v_action.status;

    -- Define valid transitions
    v_valid_transition := CASE
        WHEN v_current_status = 'pending' AND p_new_status IN ('approved', 'rejected', 'executing', 'cancelled', 'expired') THEN true
        WHEN v_current_status = 'approved' AND p_new_status IN ('executing', 'cancelled', 'expired') THEN true
        WHEN v_current_status = 'rejected' AND p_new_status IN ('cancelled') THEN true
        WHEN v_current_status = 'executing' AND p_new_status IN ('completed', 'failed', 'cancelled') THEN true
        WHEN v_current_status = 'completed' AND p_new_status IN () THEN false  -- terminal
        WHEN v_current_status = 'failed' AND p_new_status IN () THEN false    -- terminal
        WHEN v_current_status = 'cancelled' AND p_new_status IN () THEN false -- terminal
        WHEN v_current_status = 'expired' AND p_new_status IN () THEN false   -- terminal
        ELSE false
    END;

    IF NOT v_valid_transition THEN
        RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status;
    END IF;

    -- Update action
    UPDATE actions
    SET status = p_new_status,
        output = COALESCE(p_output, output),
        error_message = COALESCE(p_error_message, error_message),
        started_at = CASE WHEN p_new_status = 'executing' AND started_at IS NULL THEN now() ELSE started_at END,
        completed_at = CASE WHEN p_new_status IN ('completed', 'failed') THEN now() ELSE completed_at END,
        updated_at = now()
    WHERE id = p_action_id AND client_id = get_current_tenant_id()
    RETURNING * INTO v_action;

    -- Audit log entry
    INSERT INTO audit_logs (client_id, actor_type, actor_id, action, resource_type, resource_id, old_values, new_values)
    VALUES (
        get_current_tenant_id(),
        'worker',
        p_worker_id,
        'action_status_transition',
        'actions',
        p_action_id,
        jsonb_build_object('status', v_current_status),
        jsonb_build_object('status', p_new_status, 'output', p_output, 'error_message', p_error_message)
    );

    RETURN v_action;
END;
$$;

-- ============================================================
-- Workflow Event Processing Helper
-- ============================================================
CREATE OR REPLACE FUNCTION mark_workflow_event_processing(
    p_event_id uuid
)
RETURNS workflow_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event workflow_events;
BEGIN
    IF get_current_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'Tenant context not set';
    END IF;

    UPDATE workflow_events
    SET processed = true,
        processing_started_at = now(),
        processed_at = now(),
        updated_at = now()
    WHERE id = p_event_id AND client_id = get_current_tenant_id()
    RETURNING * INTO v_event;

    IF v_event IS NULL THEN
        RAISE EXCEPTION 'Workflow event not found or tenant mismatch';
    END IF;

    RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION mark_workflow_event_failed(
    p_event_id uuid,
    p_error text
)
RETURNS workflow_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event workflow_events;
BEGIN
    IF get_current_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'Tenant context not set';
    END IF;

    UPDATE workflow_events
    SET processed = true,
        processing_error = p_error,
        retry_count = retry_count + 1,
        updated_at = now()
    WHERE id = p_event_id AND client_id = get_current_tenant_id()
    RETURNING * INTO v_event;

    IF v_event IS NULL THEN
        RAISE EXCEPTION 'Workflow event not found or tenant mismatch';
    END IF;

    RETURN v_event;
END;
$$;

-- ============================================================
-- Audit Trail for Idempotency Operations
-- ============================================================
-- Create a view to track idempotency key usage
CREATE OR REPLACE VIEW idempotency_key_usage AS
SELECT
    'workflow_events' AS table_name,
    client_id,
    idempotency_key,
    created_at,
    processed
FROM workflow_events
WHERE idempotency_key IS NOT NULL
UNION ALL
SELECT
    'actions' AS table_name,
    client_id,
    idempotency_key,
    created_at,
    (status IN ('completed', 'failed', 'cancelled')) AS processed
FROM actions
WHERE idempotency_key IS NOT NULL
UNION ALL
SELECT
    'messages' AS table_name,
    client_id,
    conversation_id || ':' || external_message_id AS idempotency_key,
    created_at,
    (status IN ('delivered', 'failed')) AS processed
FROM messages
WHERE external_message_id IS NOT NULL;

GRANT SELECT ON idempotency_key_usage TO authenticated;