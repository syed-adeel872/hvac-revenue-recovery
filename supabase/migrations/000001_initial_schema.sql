-- Migration: 000001_initial_schema.sql
-- Description: Core tenant and business entity tables
-- Depends on: none

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. clients / tenants
-- ============================================================
CREATE TABLE clients (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    display_name text,
    timezone text NOT NULL DEFAULT 'America/New_York',
    currency text NOT NULL DEFAULT 'USD',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    settings jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX idx_clients_status ON clients(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_created_at ON clients(created_at);

-- ============================================================
-- 2. client_members (human users)
-- ============================================================
CREATE TABLE client_members (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_id uuid NOT NULL, -- Supabase Auth UUID
    email text NOT NULL,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
    invited_by uuid REFERENCES client_members(id),
    invited_at timestamptz,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, user_id)
);

CREATE INDEX idx_client_members_client_id ON client_members(client_id);
CREATE INDEX idx_client_members_user_id ON client_members(user_id);
CREATE INDEX idx_client_members_status ON client_members(status);

-- ============================================================
-- 3. customers
-- ============================================================
CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    external_id text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    zip_code text,
    tags text[] NOT NULL DEFAULT '{}',
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (client_id, external_id)
);

CREATE INDEX idx_customers_client_id ON customers(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_email ON customers(client_id, email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX idx_customers_phone ON customers(client_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX idx_customers_external_id ON customers(client_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_customers_name ON customers(client_id, last_name, first_name) WHERE deleted_at IS NULL;

-- ============================================================
-- 4. leads
-- ============================================================
CREATE TABLE leads (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    external_id text,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    source text,
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'estimate_sent', 'converted', 'lost', 'archived')),
    estimated_value numeric(12,2),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (client_id, external_id)
);

CREATE INDEX idx_leads_client_id ON leads(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_customer_id ON leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_leads_status ON leads(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_external_id ON leads(client_id, external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 5. estimates
-- ============================================================
CREATE TABLE estimates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    external_id text,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    estimate_number text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'converted_to_job', 'archived')),
    total_amount numeric(12,2) NOT NULL DEFAULT 0,
    line_items jsonb NOT NULL DEFAULT '[]',
    sent_at timestamptz,
    viewed_at timestamptz,
    expires_at timestamptz,
    converted_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (client_id, estimate_number),
    UNIQUE (client_id, external_id)
);

CREATE INDEX idx_estimates_client_id ON estimates(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_estimates_customer_id ON estimates(customer_id);
CREATE INDEX idx_estimates_lead_id ON estimates(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_estimates_status ON estimates(client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_estimates_external_id ON estimates(client_id, external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- Helper function: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER client_members_updated_at BEFORE UPDATE ON client_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER estimates_updated_at BEFORE UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security (RLS) - Base policies
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: clients
-- ============================================================
-- Members can view their own client
CREATE POLICY clients_select_member ON clients
    FOR SELECT
    USING (
        id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- Admins/owners can update their client
CREATE POLICY clients_update_admin ON clients
    FOR UPDATE
    USING (
        id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- RLS Policies: client_members
-- ============================================================
-- Members can view members of their client
CREATE POLICY client_members_select_member ON client_members
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- Admins/owners can manage members
CREATE POLICY client_members_insert_admin ON client_members
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY client_members_update_admin ON client_members
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

CREATE POLICY client_members_delete_admin ON client_members
    FOR DELETE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================
-- RLS Policies: customers
-- ============================================================
CREATE POLICY customers_select_member ON customers
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY customers_insert_member ON customers
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY customers_update_member ON customers
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

CREATE POLICY customers_delete_member ON customers
    FOR DELETE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- ============================================================
-- RLS Policies: leads
-- ============================================================
CREATE POLICY leads_select_member ON leads
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY leads_insert_member ON leads
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY leads_update_member ON leads
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

CREATE POLICY leads_delete_member ON leads
    FOR DELETE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

-- ============================================================
-- RLS Policies: estimates
-- ============================================================
CREATE POLICY estimates_select_member ON estimates
    FOR SELECT
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
        AND deleted_at IS NULL
    );

CREATE POLICY estimates_insert_member ON estimates
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );

CREATE POLICY estimates_update_member ON estimates
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

CREATE POLICY estimates_delete_member ON estimates
    FOR DELETE
    USING (
        client_id IN (
            SELECT client_id FROM client_members
            WHERE user_id = auth.uid()
            AND status = 'active'
        )
    );