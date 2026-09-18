-- Migration: 000003_booking_workflow.sql
-- Description: Bookings, workflow events, and actions tables
-- Depends on: 000001_initial_schema.sql, 000002_validation_tables.sql

-- ============================================================
-- 10. bookings
-- ============================================================
CREATE TABLE bookings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    external_id text,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
    booking_number text NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled')),
    scheduled_at timestamptz NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    cancellation_reason text,
    revenue_amount numeric(12,2),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (client_id, booking_number),
    UNIQUE (client_id, external_id)
);

CREATE INDEX idx_bookings_client_id ON bookings(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_estimate_id ON bookings(estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_bookings_lead_id ON bookings(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_bookings_conversation_id ON bookings(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_bookings_status ON bookings(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_bookings_scheduled_at ON bookings(scheduled_at);
CREATE INDEX idx_bookings_external_id ON bookings(client_id, external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 11. workflow_events
-- ============================================================
CREATE TABLE workflow_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    event_source text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}',
    processed boolean NOT NULL DEFAULT false,
    processing_started_at timestamptz,
    processed_at timestamptz,
    processing_error text,
    retry_count integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, idempotency_key)
);

CREATE INDEX idx_workflow_events_client_id ON workflow_events(client_id);
CREATE INDEX idx_workflow_events_processed ON workflow_events(client_id, processed) WHERE processed = false;
CREATE INDEX idx_workflow_events_event_type ON workflow_events(event_type);
CREATE INDEX idx_workflow_events_created_at ON workflow_events(created_at);

-- ============================================================
-- 12. actions
-- ============================================================
CREATE TABLE actions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
    booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
    workflow_event_id uuid REFERENCES workflow_events(id) ON DELETE SET NULL,
    worker_type text NOT NULL CHECK (worker_type IN ('intelligence', 'recovery', 'safety', 'operations')),
    action_type text NOT NULL,
    risk_level text NOT NULL DEFAULT 'green' CHECK (risk_level IN ('green', 'yellow', 'red')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executing', 'completed', 'failed', 'cancelled', 'expired')),
    input jsonb NOT NULL DEFAULT '{}',
    output jsonb,
    approval_required boolean NOT NULL DEFAULT false,
    approved_by uuid REFERENCES client_members(id),
    approved_at timestamptz,
    rejection_reason text,
    started_at timestamptz,
    completed_at timestamptz,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Idempotency key for tenant-scoped deduplication
    idempotency_key text,
    UNIQUE (client_id, idempotency_key)
);

CREATE INDEX idx_actions_client_id ON actions(client_id);
CREATE INDEX idx_actions_customer_id ON actions(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_actions_lead_id ON actions(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_actions_estimate_id ON actions(estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_actions_conversation_id ON actions(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_actions_booking_id ON actions(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_actions_workflow_event_id ON actions(workflow_event_id) WHERE workflow_event_id IS NOT NULL;
CREATE INDEX idx_actions_worker_type ON actions(worker_type);
CREATE INDEX idx_actions_status ON actions(client_id, status);
CREATE INDEX idx_actions_risk_level ON actions(risk_level);
CREATE INDEX idx_actions_idempotency_key ON actions(client_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_actions_created_at ON actions(created_at);

-- ============================================================
-- Apply updated_at triggers
-- ============================================================
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workflow_events_updated_at BEFORE UPDATE ON workflow_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: bookings
-- ============================================================
CREATE POLICY bookings_select_member ON bookings
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY bookings_insert_member ON bookings
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY bookings_update_member ON bookings
    FOR UPDATE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY bookings_delete_member ON bookings
    FOR DELETE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- ============================================================
-- RLS Policies: workflow_events
-- ============================================================
CREATE POLICY workflow_events_select_member ON workflow_events
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- Workflow events are inserted by system/workers, not by members directly
CREATE POLICY workflow_events_insert_system ON workflow_events
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY workflow_events_update_system ON workflow_events
    FOR UPDATE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- ============================================================
-- RLS Policies: actions
-- ============================================================
CREATE POLICY actions_select_member ON actions
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY actions_insert_worker ON actions
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY actions_update_worker ON actions
    FOR UPDATE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    )
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );