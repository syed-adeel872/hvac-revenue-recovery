-- Migration 000021: Add SECURITY DEFINER to circuit breaker functions
-- Prevents privilege escalation via definer-owns execution context

BEGIN;

-- 1. atomic_record_circuit_breaker_failure
CREATE OR REPLACE FUNCTION atomic_record_circuit_breaker_failure(
    p_client_id uuid,
    p_failure_threshold integer DEFAULT 5,
    p_recovery_timeout_ms integer DEFAULT 300000
)
RETURNS TABLE(new_state text, new_failure_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row circuit_breaker_state%ROWTYPE;
    v_new_count integer;
    v_new_state text;
BEGIN
    SELECT * INTO v_row
    FROM circuit_breaker_state
    WHERE client_id = p_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO circuit_breaker_state (client_id, state, failure_count, last_failure_time)
        VALUES (p_client_id, 'CLOSED', 1, now())
        RETURNING circuit_breaker_state.state, circuit_breaker_state.failure_count
        INTO v_new_state, v_new_count;
    ELSE
        v_new_count := v_row.failure_count + 1;

        IF v_new_count >= p_failure_threshold THEN
            v_new_state := 'OPEN';
        ELSE
            v_new_state := v_row.state;
        END IF;

        UPDATE circuit_breaker_state
        SET state = v_new_state,
            failure_count = v_new_count,
            last_failure_time = now(),
            updated_at = now()
        WHERE client_id = p_client_id;
    END IF;

    RETURN QUERY SELECT v_new_state, v_new_count;
END;
$$;

-- 2. atomic_record_circuit_breaker_success
CREATE OR REPLACE FUNCTION atomic_record_circuit_breaker_success(
    p_client_id uuid
)
RETURNS TABLE(new_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row circuit_breaker_state%ROWTYPE;
    v_new_state text;
BEGIN
    SELECT * INTO v_row
    FROM circuit_breaker_state
    WHERE client_id = p_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO circuit_breaker_state (client_id, state, failure_count)
        VALUES (p_client_id, 'CLOSED', 0)
        RETURNING circuit_breaker_state.state INTO v_new_state;
    ELSIF v_row.state = 'HALF_OPEN' THEN
        UPDATE circuit_breaker_state
        SET state = 'CLOSED', failure_count = 0, last_failure_time = NULL, updated_at = now()
        WHERE client_id = p_client_id;
        v_new_state := 'CLOSED';
    ELSIF v_row.state = 'OPEN' THEN
        v_new_state := v_row.state;
    ELSE
        UPDATE circuit_breaker_state
        SET failure_count = 0, updated_at = now()
        WHERE client_id = p_client_id;
        v_new_state := 'CLOSED';
    END IF;

    RETURN QUERY SELECT v_new_state;
END;
$$;

-- 3. atomic_check_circuit_breaker
CREATE OR REPLACE FUNCTION atomic_check_circuit_breaker(
    p_client_id uuid,
    p_recovery_timeout_ms integer DEFAULT 300000
)
RETURNS TABLE(can_execute boolean, current_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row circuit_breaker_state%ROWTYPE;
    v_can_execute boolean;
    v_state text;
BEGIN
    SELECT * INTO v_row
    FROM circuit_breaker_state
    WHERE client_id = p_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO circuit_breaker_state (client_id, state, failure_count)
        VALUES (p_client_id, 'CLOSED', 0)
        ON CONFLICT (client_id) DO NOTHING;
        RETURN QUERY SELECT true, 'CLOSED'::text;
        RETURN;
    END IF;

    v_state := v_row.state;

    IF v_state = 'CLOSED' THEN
        v_can_execute := true;
    ELSIF v_state = 'OPEN' THEN
        IF extract(epoch from (now() - v_row.last_failure_time)) * 1000 >= p_recovery_timeout_ms THEN
            UPDATE circuit_breaker_state
            SET state = 'HALF_OPEN', updated_at = now()
            WHERE client_id = p_client_id;
            v_can_execute := true;
            v_state := 'HALF_OPEN';
        ELSE
            v_can_execute := false;
        END IF;
    ELSIF v_state = 'HALF_OPEN' THEN
        v_can_execute := true;
    ELSE
        v_can_execute := true;
    END IF;

    RETURN QUERY SELECT v_can_execute, v_state;
END;
$$;

COMMIT;
