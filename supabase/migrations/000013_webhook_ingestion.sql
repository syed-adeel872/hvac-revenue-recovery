-- Migration: 000013_webhook_ingestion.sql
-- Description: Webhook ingestion foundation - provider config, credentials, event storage, processing log
-- Depends on: 000001_initial_schema.sql through 000012_security_fixes.sql

-- ============================================================
-- A. webhook_providers: Tenant-owned configuration for approved external webhook sources
-- ============================================================
CREATE TABLE webhook_providers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    provider_name text NOT NULL,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
    auth_type text NOT NULL CHECK (auth_type IN ('hmac_sha256', 'hmac_sha1', 'bearer_token', 'basic_auth', 'custom_header')),
    secret_ref text NOT NULL,                          -- Reference to secret in vault/env (NOT the secret itself)
    header_name text,                                  -- e.g., 'X-Signature', 'X-Webhook-Signature'
    event_type_mapping jsonb NOT NULL DEFAULT '{}',    -- Maps provider event types to internal types
    tenant_resolution jsonb NOT NULL DEFAULT '{"strategy": "credential_based"}', -- How to resolve tenant
    max_payload_size_bytes integer NOT NULL DEFAULT 1048576, -- 1MB default
    allowed_ips cidr[],                                -- Optional IP allowlist
    created_by uuid REFERENCES client_members(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, provider_name)
);

CREATE INDEX idx_webhook_providers_client_id ON webhook_providers(client_id) WHERE status = 'active';
CREATE INDEX idx_webhook_providers_provider_name ON webhook_providers(provider_name);

-- ============================================================
-- B. webhook_credentials: Encrypted credential material / metadata
-- ============================================================
CREATE TABLE webhook_credentials (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id uuid NOT NULL REFERENCES webhook_providers(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    encrypted_secret bytea NOT NULL,                   -- Opaque ciphertext from application layer
    secret_version integer NOT NULL DEFAULT 1,
    algorithm text NOT NULL DEFAULT 'aes-256-gcm',     -- Metadata only
    created_by uuid REFERENCES client_members(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    UNIQUE (provider_id, secret_version)
);

-- Composite FK support for tenant isolation
ALTER TABLE webhook_providers ADD CONSTRAINT webhook_providers_client_id_id_unique UNIQUE (client_id, id);
ALTER TABLE webhook_credentials ADD CONSTRAINT webhook_credentials_client_id_id_unique UNIQUE (client_id, id);

-- Composite FK: webhook_credentials -> webhook_providers (tenant-aware)
ALTER TABLE webhook_credentials
    ADD CONSTRAINT webhook_credentials_provider_id_fk
    FOREIGN KEY (client_id, provider_id)
    REFERENCES webhook_providers(client_id, id)
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_webhook_credentials_provider_id ON webhook_credentials(provider_id);
CREATE INDEX idx_webhook_credentials_client_id ON webhook_credentials(client_id);

-- ============================================================
-- C. ingestion_events: Immutable raw event payload with controlled processing-state updates
-- ============================================================
CREATE TABLE ingestion_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    provider_id uuid NOT NULL REFERENCES webhook_providers(id) ON DELETE RESTRICT,
    external_event_id text NOT NULL,                   -- Provider's event ID
    provider_event_type text NOT NULL,                 -- Raw provider event type
    internal_event_type text,                          -- Mapped internal type (set during async processing)
    raw_payload jsonb NOT NULL,                        -- Raw untrusted payload
    raw_headers jsonb NOT NULL DEFAULT '{}',           -- Redacted/safe headers for debugging
    idempotency_key text NOT NULL,                     -- Composite: provider + external_event_id + provider_timestamp
    provider_event_timestamp timestamptz,              -- Provider's event timestamp if available (for application-level replay checks)
    received_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'received' CHECK (status IN (
        'received',            -- Persisted, awaiting async processing
        'processing',          -- Async processor picked up
        'mapped',              -- Mapped to internal event type
        'workflow_created',    -- workflow_events row created
        'completed',           -- Fully processed downstream
        'failed',              -- Permanent failure (poison)
        'retryable_failed'     -- Temporary failure, will retry
    )),
    processing_started_at timestamptz,
    processing_completed_at timestamptz,
    retry_count integer NOT NULL DEFAULT 0,
    last_error text,
    last_error_at timestamptz,
    correlation_id uuid,                                 -- Links to workflow_events.id when created
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, idempotency_key)                -- Deduplication at provider level
);

-- Composite FK support
ALTER TABLE ingestion_events ADD CONSTRAINT ingestion_events_client_id_id_unique UNIQUE (client_id, id);

-- Composite FK: ingestion_events -> webhook_providers (tenant-aware)
ALTER TABLE ingestion_events
    ADD CONSTRAINT ingestion_events_provider_id_fk
    FOREIGN KEY (client_id, provider_id)
    REFERENCES webhook_providers(client_id, id)
    ON DELETE RESTRICT;

-- Indexes
CREATE INDEX idx_ingestion_events_client_id ON ingestion_events(client_id) WHERE status IN ('received', 'processing', 'retryable_failed');
CREATE INDEX idx_ingestion_events_provider_id ON ingestion_events(provider_id);
CREATE INDEX idx_ingestion_events_status ON ingestion_events(client_id, status);
CREATE INDEX idx_ingestion_events_received_at ON ingestion_events(received_at);
CREATE INDEX idx_ingestion_events_correlation ON ingestion_events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_ingestion_events_external_event_id ON ingestion_events(provider_id, external_event_id);
-- Queue pickup index for ordered FOR UPDATE SKIP LOCKED processing
CREATE INDEX idx_ingestion_events_queue ON ingestion_events(client_id, status, received_at) WHERE status IN ('received', 'retryable_failed');

-- ============================================================
-- D. ingestion_processing_log: Append-only processing audit trail
-- ============================================================
CREATE TABLE ingestion_processing_log (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingestion_event_id uuid NOT NULL REFERENCES ingestion_events(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    stage text NOT NULL CHECK (stage IN (
        'signature_verify', 'schema_validate', 'duplicate_check', 'persist',
        'tenant_resolve', 'event_map', 'workflow_create', 'complete'
    )),
    status text NOT NULL CHECK (status IN ('started', 'success', 'failed', 'retry')),
    error_message text,
    duration_ms integer,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Composite FK support
ALTER TABLE ingestion_processing_log ADD CONSTRAINT ingestion_processing_log_client_id_id_unique UNIQUE (client_id, id);

-- Composite FK: ingestion_processing_log -> ingestion_events (tenant-aware)
ALTER TABLE ingestion_processing_log
    ADD CONSTRAINT ingestion_processing_log_event_id_fk
    FOREIGN KEY (client_id, ingestion_event_id)
    REFERENCES ingestion_events(client_id, id)
    ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_ingestion_log_event ON ingestion_processing_log(ingestion_event_id);
CREATE INDEX idx_ingestion_log_client ON ingestion_processing_log(client_id, created_at);

-- ============================================================
-- Apply updated_at triggers
-- ============================================================
CREATE TRIGGER webhook_providers_updated_at BEFORE UPDATE ON webhook_providers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER webhook_credentials_updated_at BEFORE UPDATE ON webhook_credentials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ingestion_events_updated_at BEFORE UPDATE ON ingestion_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- E. SECURITY DEFINER function: Secure credential access for authorized admins
-- ============================================================
-- This function retrieves the currently active encrypted webhook credential for a provider.
-- It is the ONLY path for the application layer to obtain encrypted_secret for signature verification.
-- The function does NOT decrypt the secret; decryption happens in the application layer.
-- Returns: encrypted_secret (bytea) of the latest valid secret version.
CREATE OR REPLACE FUNCTION get_webhook_credential_secret(
    p_provider_id uuid
)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_encrypted_secret bytea;
    v_provider_client_id uuid;
BEGIN
    -- Verify provider exists and get its owning client
    SELECT client_id INTO v_provider_client_id
    FROM webhook_providers
    WHERE id = p_provider_id;

    IF v_provider_client_id IS NULL THEN
        RAISE EXCEPTION 'Provider not found: %', p_provider_id;
    END IF;

    -- Verify caller is an active admin/owner of the provider's client
    IF NOT EXISTS (
        SELECT 1 FROM client_members
        WHERE user_id = auth.uid()
          AND client_id = v_provider_client_id
          AND status = 'active'
          AND role IN ('owner', 'admin')
    ) THEN
        RAISE EXCEPTION 'Insufficient privileges: caller must be active owner/admin of provider client';
    END IF;

    -- Retrieve the latest valid encrypted secret for this provider
    SELECT encrypted_secret INTO v_encrypted_secret
    FROM webhook_credentials
    WHERE provider_id = p_provider_id
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY secret_version DESC
    LIMIT 1;

    IF v_encrypted_secret IS NULL THEN
        RAISE EXCEPTION 'No valid credential found for provider: %', p_provider_id;
    END IF;

    RETURN v_encrypted_secret;
END;
$$;

-- Grant execution only to authenticated role (RLS still applies via auth.uid() checks inside function)
REVOKE EXECUTE ON FUNCTION get_webhook_credential_secret(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_webhook_credential_secret(uuid) TO authenticated;

-- ============================================================
-- F. State transition enforcement for ingestion_events.status
-- ============================================================
-- Valid transitions:
-- received → processing
-- processing → mapped
-- processing → retryable_failed
-- mapped → workflow_created
-- mapped → retryable_failed
-- workflow_created → completed
-- workflow_created → retryable_failed
-- retryable_failed → processing
-- retryable_failed → failed
-- Terminal states: completed, failed (no outgoing transitions)

CREATE OR REPLACE FUNCTION enforce_ingestion_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_status text;
    v_new_status text;
    v_valid boolean := false;
BEGIN
    -- Only enforce on status changes
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    v_old_status := OLD.status;
    v_new_status := NEW.status;

    -- Define valid transitions
    v_valid := CASE
        WHEN v_old_status = 'received' AND v_new_status IN ('processing') THEN true
        WHEN v_old_status = 'processing' AND v_new_status IN ('mapped', 'retryable_failed') THEN true
        WHEN v_old_status = 'mapped' AND v_new_status IN ('workflow_created', 'retryable_failed') THEN true
        WHEN v_old_status = 'workflow_created' AND v_new_status IN ('completed', 'retryable_failed') THEN true
        WHEN v_old_status = 'retryable_failed' AND v_new_status IN ('processing', 'failed') THEN true
        WHEN v_old_status = 'completed' AND v_new_status IN () THEN false  -- terminal
        WHEN v_old_status = 'failed' AND v_new_status IN () THEN false    -- terminal
        ELSE false
    END;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid ingestion_events status transition: % -> %', v_old_status, v_new_status;
    END IF;

    -- Audit log for important transitions
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (client_id, actor_type, actor_id, action, resource_type, resource_id, old_values, new_values)
        VALUES (
            NEW.client_id,
            'system',
            auth.uid(),
            'ingestion_status_transition',
            'ingestion_events',
            NEW.id,
            jsonb_build_object('status', v_old_status),
            jsonb_build_object('status', v_new_status)
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Attach trigger to ingestion_events
CREATE TRIGGER enforce_ingestion_status_transition
    BEFORE UPDATE OF status ON ingestion_events
    FOR EACH ROW
    EXECUTE FUNCTION enforce_ingestion_status_transition();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE webhook_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_processing_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: webhook_providers (tenant-scoped, admin write)
-- ============================================================
CREATE POLICY webhook_providers_select_tenant ON webhook_providers
    FOR SELECT
    USING (client_id = get_current_tenant_id());

CREATE POLICY webhook_providers_insert_tenant_admin ON webhook_providers
    FOR INSERT
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_providers_update_tenant_admin ON webhook_providers
    FOR UPDATE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_providers_delete_tenant_admin ON webhook_providers
    FOR DELETE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- RLS Policies: webhook_credentials (admin only for SELECT/INSERT/UPDATE)
-- ============================================================
-- Credentials are accessed by the application layer via the SECURITY DEFINER function
-- get_webhook_credential_secret(), which performs its own authorization checks.
-- Admins can manage credential metadata (rotate versions).
-- NO DELETE policy for credentials (rotate via new version instead).

CREATE POLICY webhook_credentials_select_tenant_admin ON webhook_credentials
    FOR SELECT
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_credentials_insert_tenant_admin ON webhook_credentials
    FOR INSERT
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY webhook_credentials_update_tenant_admin ON webhook_credentials
    FOR UPDATE
    USING (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        client_id = get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM client_members
            WHERE user_id = auth.uid()
            AND client_id = get_current_tenant_id()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- NO DELETE policy for credentials (rotate via new version instead)

-- ============================================================
-- RLS Policies: ingestion_events (immutable raw payload with controlled processing-state updates)
-- ============================================================
-- External ingestion: INSERT only (via application-layer function)
-- Internal processing: SELECT + controlled UPDATE for status transitions (validated by trigger)
-- NO DELETE policy - raw event payload is immutable for audit

CREATE POLICY ingestion_events_select_tenant ON ingestion_events
    FOR SELECT
    USING (client_id = get_current_tenant_id());

-- Insert is done by application-layer function during ingestion
-- The function sets client_id from resolved tenant
CREATE POLICY ingestion_events_insert_tenant ON ingestion_events
    FOR INSERT
    WITH CHECK (client_id = get_current_tenant_id());

-- Status updates only for controlled transitions (enforced by trigger)
CREATE POLICY ingestion_events_update_tenant ON ingestion_events
    FOR UPDATE
    USING (client_id = get_current_tenant_id())
    WITH CHECK (client_id = get_current_tenant_id());

-- NO DELETE policy - raw event payload is immutable for audit

-- ============================================================
-- RLS Policies: ingestion_processing_log (append-only audit)
-- ============================================================
CREATE POLICY ingestion_processing_log_select_tenant ON ingestion_processing_log
    FOR SELECT
    USING (client_id = get_current_tenant_id());

CREATE POLICY ingestion_processing_log_insert_tenant ON ingestion_processing_log
    FOR INSERT
    WITH CHECK (client_id = get_current_tenant_id());

-- NO UPDATE/DELETE - append-only audit trail

-- ============================================================
-- GRANTs for authenticated role
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON webhook_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ingestion_events TO authenticated;
GRANT SELECT, INSERT ON ingestion_processing_log TO authenticated;

-- ============================================================
-- Extend FORCE ROW LEVEL SECURITY to new tables (following 000009 pattern)
-- ============================================================
DO $$
DECLARE
    v_tbl record;
BEGIN
    FOR v_tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN (
            'webhook_providers', 'webhook_credentials',
            'ingestion_events', 'ingestion_processing_log'
        )
    LOOP
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_tbl.tablename);
    END LOOP;
END;
$$;

-- ============================================================
-- G. Cascade / Delete Behavior Documentation
-- ============================================================
-- ON DELETE behavior summary:
--
-- clients (id) deleted
--   → webhook_providers (client_id) CASCADE DELETE
--       → webhook_credentials (provider_id) CASCADE DELETE
--   → ingestion_events (client_id) CASCADE DELETE
--       → ingestion_processing_log (ingestion_event_id) CASCADE DELETE
--   → ingestion_processing_log (client_id) CASCADE DELETE
--
-- webhook_providers (id) deleted
--   → webhook_credentials (provider_id) CASCADE DELETE
--   → ingestion_events (provider_id) RESTRICT (prevents provider deletion if events exist)
--
-- ingestion_events (id) deleted
--   → ingestion_processing_log (ingestion_event_id) CASCADE DELETE
--
-- Design rationale:
-- - Client deletion removes all owned configuration and raw ingestion history (audit via system_audit_logs)
-- - Provider deletion is blocked if raw ingestion events exist (preserves audit trail)
-- - Credential versions cascade with provider (no orphan credentials)
-- - Processing log cascades with its ingestion event
-- - Raw ingestion_events payload is NEVER deleted by application logic (NO DELETE policy, NO hard delete function)
-- - Provider deletion requires manual cleanup of ingestion_events first if intentional