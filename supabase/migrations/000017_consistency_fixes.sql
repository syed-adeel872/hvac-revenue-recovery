-- Migration 000017: Database consistency fixes
-- 1. Fix leads RLS tautology
-- 2. Add booking status transition enforcement
-- 3. Add atomic circuit breaker operations

BEGIN;

-- 1. Fix leads RLS tautology (leads uses status-based pipeline, no soft-delete)
--    000007 dropped leads.deleted_at; leads uses status enum instead.
DROP POLICY IF EXISTS leads_select_tenant ON leads;
CREATE POLICY leads_select_tenant ON leads
    FOR SELECT
    USING (client_id = get_current_tenant_id());

-- 2. Booking status transition enforcement
CREATE OR REPLACE FUNCTION enforce_booking_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_current_status text;
    v_new_status text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_current_status := OLD.status;
        v_new_status := NEW.status;

        IF v_current_status = v_new_status THEN
            RETURN NEW;
        END IF;

        IF v_current_status = 'scheduled' AND v_new_status IN ('confirmed', 'cancelled', 'rescheduled') THEN
            RETURN NEW;
        ELSIF v_current_status = 'confirmed' AND v_new_status IN ('in_progress', 'cancelled', 'no_show', 'rescheduled') THEN
            RETURN NEW;
        ELSIF v_current_status = 'in_progress' AND v_new_status IN ('completed', 'cancelled', 'no_show') THEN
            RETURN NEW;
        ELSIF v_current_status = 'rescheduled' AND v_new_status IN ('scheduled', 'cancelled') THEN
            RETURN NEW;
        ELSE
            RAISE EXCEPTION 'Invalid booking status transition from % to %', v_current_status, v_new_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_booking_status_transition
    BEFORE UPDATE OF status ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION enforce_booking_status_transition();

-- 3. Atomic circuit breaker operations
CREATE OR REPLACE FUNCTION atomic_record_circuit_breaker_failure(
    p_client_id uuid,
    p_failure_threshold integer DEFAULT 5,
    p_recovery_timeout_ms integer DEFAULT 300000
)
RETURNS TABLE(new_state text, new_failure_count integer) AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION atomic_record_circuit_breaker_success(
    p_client_id uuid
)
RETURNS TABLE(new_state text) AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION atomic_check_circuit_breaker(
    p_client_id uuid,
    p_recovery_timeout_ms integer DEFAULT 300000
)
RETURNS TABLE(can_execute boolean, current_state text) AS $$
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
        v_can_execute := false;
    ELSE
        v_can_execute := true;
    END IF;

    RETURN QUERY SELECT v_can_execute, v_state;
END;
$$ LANGUAGE plpgsql;

COMMIT;
