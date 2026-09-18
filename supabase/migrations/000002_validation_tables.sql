-- Migration: 000002_validation_tables.sql
-- Description: Consent, opt-out, conversations, and messages tables
-- Depends on: 000001_initial_schema.sql

-- ============================================================
-- 6. consents
-- ============================================================
CREATE TABLE consents (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('sms', 'email', 'phone_call')),
    status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('granted', 'revoked', 'pending', 'unknown')),
    source text,
    proof_reference text,
    granted_at timestamptz,
    revoked_at timestamptz,
    expires_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, customer_id, type)
);

CREATE INDEX idx_consents_client_id ON consents(client_id);
CREATE INDEX idx_consents_customer_id ON consents(customer_id);
CREATE INDEX idx_consents_type_status ON consents(type, status);

-- ============================================================
-- 7. opt_out_keywords
-- ============================================================
CREATE TABLE opt_out_keywords (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    keyword text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('sms', 'email', 'phone_call', 'all')),
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES client_members(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, keyword, channel)
);

CREATE INDEX idx_opt_out_keywords_client_id ON opt_out_keywords(client_id) WHERE is_active = true;
CREATE INDEX idx_opt_out_keywords_keyword ON opt_out_keywords(client_id, keyword) WHERE is_active = true;

-- ============================================================
-- 8. conversations
-- ============================================================
CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    estimate_id uuid REFERENCES estimates(id) ON DELETE SET NULL,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    channel text NOT NULL CHECK (channel IN ('sms', 'email', 'phone', 'chat')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived', 'handoff_required')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz
);

CREATE INDEX idx_conversations_client_id ON conversations(client_id);
CREATE INDEX idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX idx_conversations_estimate_id ON conversations(estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_conversations_status ON conversations(client_id, status);

-- ============================================================
-- 9. messages
-- ============================================================
CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    channel text NOT NULL CHECK (channel IN ('sms', 'email', 'phone', 'chat')),
    content text NOT NULL,
    external_message_id text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'received')),
    sent_at timestamptz,
    delivered_at timestamptz,
    failed_at timestamptz,
    error_code text,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, conversation_id, external_message_id)
);

CREATE INDEX idx_messages_client_id ON messages(client_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_customer_id ON messages(customer_id);
CREATE INDEX idx_messages_external_message_id ON messages(client_id, conversation_id, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_messages_status ON messages(client_id, status);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================================
-- Apply updated_at triggers
-- ============================================================
CREATE TRIGGER consents_updated_at BEFORE UPDATE ON consents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER opt_out_keywords_updated_at BEFORE UPDATE ON opt_out_keywords FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_out_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: consents
-- ============================================================
CREATE POLICY consents_select_member ON consents
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY consents_insert_member ON consents
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY consents_update_member ON consents
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
-- RLS Policies: opt_out_keywords
-- ============================================================
CREATE POLICY opt_out_keywords_select_member ON opt_out_keywords
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY opt_out_keywords_insert_admin ON opt_out_keywords
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY opt_out_keywords_update_admin ON opt_out_keywords
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
-- RLS Policies: conversations
-- ============================================================
CREATE POLICY conversations_select_member ON conversations
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY conversations_insert_member ON conversations
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY conversations_update_member ON conversations
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
-- RLS Policies: messages
-- ============================================================
CREATE POLICY messages_select_member ON messages
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY messages_insert_member ON messages
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY messages_update_member ON messages
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