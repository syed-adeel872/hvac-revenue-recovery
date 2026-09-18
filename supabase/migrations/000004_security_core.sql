-- Migration: 000004_security_core.sql
-- Description: Errors, audit logs, SOPs, API usage, cost ledger
-- Depends on: 000001_initial_schema.sql, 000002_validation_tables.sql, 000003_booking_workflow.sql

-- ============================================================
-- 13. errors
-- ============================================================
CREATE TABLE errors (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workflow_event_id uuid REFERENCES workflow_events(id) ON DELETE SET NULL,
    action_id uuid REFERENCES actions(id) ON DELETE SET NULL,
    worker_type text NOT NULL CHECK (worker_type IN ('intelligence', 'recovery', 'safety', 'operations', 'orchestrator', 'unknown')),
    error_code text NOT NULL,
    error_message text NOT NULL,
    severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    context jsonb,
    stack_trace text,
    resolved boolean NOT NULL DEFAULT false,
    resolved_at timestamptz,
    resolved_by uuid REFERENCES client_members(id),
    resolution_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_errors_client_id ON errors(client_id);
CREATE INDEX idx_errors_workflow_event_id ON errors(workflow_event_id) WHERE workflow_event_id IS NOT NULL;
CREATE INDEX idx_errors_action_id ON errors(action_id) WHERE action_id IS NOT NULL;
CREATE INDEX idx_errors_severity ON errors(severity);
CREATE INDEX idx_errors_resolved ON errors(resolved) WHERE resolved = false;
CREATE INDEX idx_errors_created_at ON errors(created_at);

-- ============================================================
-- 14. audit_logs
-- ============================================================
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    actor_type text NOT NULL CHECK (actor_type IN ('user', 'worker', 'system', 'webhook', 'api')),
    actor_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    old_values jsonb,
    new_values jsonb,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_actor_type ON audit_logs(actor_type);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- 15. system_audit_logs (for pre-authorization/system events)
-- ============================================================
CREATE TABLE system_audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type text NOT NULL CHECK (actor_type IN ('system', 'migration', 'security', 'admin')),
    actor_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid,
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL, -- nullable for cross-tenant system events
    old_values jsonb,
    new_values jsonb,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_audit_logs_client_id ON system_audit_logs(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_system_audit_logs_action ON system_audit_logs(action);
CREATE INDEX idx_system_audit_logs_created_at ON system_audit_logs(created_at);

-- ============================================================
-- 16. client_sops
-- ============================================================
CREATE TABLE client_sops (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name text NOT NULL,
    version text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'deprecated')),
    content jsonb NOT NULL DEFAULT '{}',
    effective_at timestamptz NOT NULL,
    expires_at timestamptz,
    created_by uuid REFERENCES client_members(id),
    approved_by uuid REFERENCES client_members(id),
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, name, version)
);

CREATE INDEX idx_client_sops_client_id ON client_sops(client_id);
CREATE INDEX idx_client_sops_status ON client_sops(client_id, status);
CREATE INDEX idx_client_sops_effective_at ON client_sops(effective_at);

-- ============================================================
-- 17. api_usage
-- ============================================================
CREATE TABLE api_usage (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    provider text NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    status_code integer,
    request_count integer NOT NULL DEFAULT 1,
    response_time_ms integer,
    cost_usd numeric(12,6) NOT NULL DEFAULT 0,
    metadata jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_client_id ON api_usage(client_id);
CREATE INDEX idx_api_usage_provider ON api_usage(provider);
CREATE INDEX idx_api_usage_recorded_at ON api_usage(recorded_at);

-- ============================================================
-- 18. cost_ledger
-- ============================================================
CREATE TABLE cost_ledger (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('llm', 'messaging', 'crm_api', 'storage', 'compute', 'other')),
    provider text NOT NULL,
    description text NOT NULL,
    amount_usd numeric(12,6) NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    unit_cost_usd numeric(12,6),
    reference_type text,
    reference_id uuid,
    metadata jsonb,
    incurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_ledger_client_id ON cost_ledger(client_id);
CREATE INDEX idx_cost_ledger_category ON cost_ledger(category);
CREATE INDEX idx_cost_ledger_incurred_at ON cost_ledger(incurred_at);
CREATE INDEX idx_cost_ledger_reference ON cost_ledger(reference_type, reference_id) WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

-- ============================================================
-- 19. worker_authorizations
-- ============================================================
CREATE TABLE worker_authorizations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL, -- Worker's Supabase Auth UUID
    worker_type text NOT NULL CHECK (worker_type IN ('intelligence', 'recovery', 'safety', 'operations')),
    scope text[] NOT NULL DEFAULT '{}', -- e.g., ['read:customers', 'write:actions', 'read:estimates']
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    granted_by uuid REFERENCES client_members(id),
    granted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES client_members(id),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, worker_id, worker_type)
);

CREATE INDEX idx_worker_authorizations_client_id ON worker_authorizations(client_id);
CREATE INDEX idx_worker_authorizations_worker_id ON worker_authorizations(worker_id);
CREATE INDEX idx_worker_authorizations_status ON worker_authorizations(status) WHERE status = 'active';

-- ============================================================
-- Apply updated_at triggers
-- ============================================================
CREATE TRIGGER errors_updated_at BEFORE UPDATE ON errors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER client_sops_updated_at BEFORE UPDATE ON client_sops FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER worker_authorizations_updated_at BEFORE UPDATE ON worker_authorizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_authorizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: errors
-- ============================================================
CREATE POLICY errors_select_member ON errors
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY errors_insert_system ON errors
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY errors_update_member ON errors
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
-- RLS Policies: audit_logs (append-only for normal access)
-- ============================================================
CREATE POLICY audit_logs_select_member ON audit_logs
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- Audit logs are append-only for normal application access
CREATE POLICY audit_logs_insert_system ON audit_logs
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- NO UPDATE/DELETE policies for audit_logs - append-only

-- ============================================================
-- RLS Policies: system_audit_logs (restricted)
-- ============================================================
CREATE POLICY system_audit_logs_select_admin ON system_audit_logs
    FOR SELECT
    USING (
        client_id IS NULL OR
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY system_audit_logs_insert_system ON system_audit_logs
    FOR INSERT
    WITH CHECK (true); -- System can insert

-- NO UPDATE/DELETE for system_audit_logs

-- ============================================================
-- RLS Policies: client_sops
-- ============================================================
CREATE POLICY client_sops_select_member ON client_sops
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY client_sops_insert_admin ON client_sops
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY client_sops_update_admin ON client_sops
    FOR UPDATE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- RLS Policies: api_usage
-- ============================================================
CREATE POLICY api_usage_select_member ON api_usage
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY api_usage_insert_system ON api_usage
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- ============================================================
-- RLS Policies: cost_ledger
-- ============================================================
CREATE POLICY cost_ledger_select_member ON cost_ledger
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY cost_ledger_insert_system ON cost_ledger
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- ============================================================
-- RLS Policies: worker_authorizations
-- ============================================================
CREATE POLICY worker_authorizations_select_admin ON worker_authorizations
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY worker_authorizations_insert_admin ON worker_authorizations
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY worker_authorizations_update_admin ON worker_authorizations
    FOR UPDATE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );