-- Migration: 000006_cross_tenant_fks.sql
-- Description: Composite foreign keys for cross-tenant referential integrity
-- Depends on: 000001_initial_schema.sql, 000002_validation_tables.sql, 000003_booking_workflow.sql, 000004_security_core.sql, 000005_rls_policies.sql

-- ============================================================
-- Add UNIQUE constraints on (client_id, id) for composite FK targets
-- ============================================================

-- customers
ALTER TABLE customers ADD CONSTRAINT customers_client_id_id_unique UNIQUE (client_id, id);

-- leads
ALTER TABLE leads ADD CONSTRAINT leads_client_id_id_unique UNIQUE (client_id, id);

-- estimates
ALTER TABLE estimates ADD CONSTRAINT estimates_client_id_id_unique UNIQUE (client_id, id);

-- conversations
ALTER TABLE conversations ADD CONSTRAINT conversations_client_id_id_unique UNIQUE (client_id, id);

-- bookings
ALTER TABLE bookings ADD CONSTRAINT bookings_client_id_id_unique UNIQUE (client_id, id);

-- ============================================================
-- Composite Foreign Keys: Child tables reference parent with client_id
-- ============================================================

-- leads.customer_id -> customers(client_id, id)
ALTER TABLE leads
    ADD CONSTRAINT leads_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE SET NULL;

-- estimates.customer_id -> customers(client_id, id)
ALTER TABLE estimates
    ADD CONSTRAINT estimates_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE CASCADE;

-- estimates.lead_id -> leads(client_id, id)
ALTER TABLE estimates
    ADD CONSTRAINT estimates_lead_id_fk
    FOREIGN KEY (client_id, lead_id)
    REFERENCES leads(client_id, id)
    ON DELETE SET NULL;

-- consents.customer_id -> customers(client_id, id)
ALTER TABLE consents
    ADD CONSTRAINT consents_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE CASCADE;

-- conversations.customer_id -> customers(client_id, id)
ALTER TABLE conversations
    ADD CONSTRAINT conversations_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE CASCADE;

-- conversations.estimate_id -> estimates(client_id, id)
ALTER TABLE conversations
    ADD CONSTRAINT conversations_estimate_id_fk
    FOREIGN KEY (client_id, estimate_id)
    REFERENCES estimates(client_id, id)
    ON DELETE SET NULL;

-- conversations.lead_id -> leads(client_id, id)
ALTER TABLE conversations
    ADD CONSTRAINT conversations_lead_id_fk
    FOREIGN KEY (client_id, lead_id)
    REFERENCES leads(client_id, id)
    ON DELETE SET NULL;

-- messages.conversation_id -> conversations(client_id, id)
ALTER TABLE messages
    ADD CONSTRAINT messages_conversation_id_fk
    FOREIGN KEY (client_id, conversation_id)
    REFERENCES conversations(client_id, id)
    ON DELETE CASCADE;

-- messages.customer_id -> customers(client_id, id)
ALTER TABLE messages
    ADD CONSTRAINT messages_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE CASCADE;

-- bookings.customer_id -> customers(client_id, id)
ALTER TABLE bookings
    ADD CONSTRAINT bookings_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE CASCADE;

-- bookings.estimate_id -> estimates(client_id, id)
ALTER TABLE bookings
    ADD CONSTRAINT bookings_estimate_id_fk
    FOREIGN KEY (client_id, estimate_id)
    REFERENCES estimates(client_id, id)
    ON DELETE SET NULL;

-- bookings.lead_id -> leads(client_id, id)
ALTER TABLE bookings
    ADD CONSTRAINT bookings_lead_id_fk
    FOREIGN KEY (client_id, lead_id)
    REFERENCES leads(client_id, id)
    ON DELETE SET NULL;

-- bookings.conversation_id -> conversations(client_id, id)
ALTER TABLE bookings
    ADD CONSTRAINT bookings_conversation_id_fk
    FOREIGN KEY (client_id, conversation_id)
    REFERENCES conversations(client_id, id)
    ON DELETE SET NULL;

-- workflow_events: No cross-entity FKs (standalone events)

-- actions.customer_id -> customers(client_id, id)
ALTER TABLE actions
    ADD CONSTRAINT actions_customer_id_fk
    FOREIGN KEY (client_id, customer_id)
    REFERENCES customers(client_id, id)
    ON DELETE SET NULL;

-- actions.lead_id -> leads(client_id, id)
ALTER TABLE actions
    ADD CONSTRAINT actions_lead_id_fk
    FOREIGN KEY (client_id, lead_id)
    REFERENCES leads(client_id, id)
    ON DELETE SET NULL;

-- actions.estimate_id -> estimates(client_id, id)
ALTER TABLE actions
    ADD CONSTRAINT actions_estimate_id_fk
    FOREIGN KEY (client_id, estimate_id)
    REFERENCES estimates(client_id, id)
    ON DELETE SET NULL;

-- actions.conversation_id -> conversations(client_id, id)
ALTER TABLE actions
    ADD CONSTRAINT actions_conversation_id_fk
    FOREIGN KEY (client_id, conversation_id)
    REFERENCES conversations(client_id, id)
    ON DELETE SET NULL;

-- actions.booking_id -> bookings(client_id, id)
ALTER TABLE actions
    ADD CONSTRAINT actions_booking_id_fk
    FOREIGN KEY (client_id, booking_id)
    REFERENCES bookings(client_id, id)
    ON DELETE SET NULL;

-- actions.workflow_event_id -> workflow_events(client_id, id)
-- Note: workflow_events doesn't have client_id + id unique constraint
-- We add it here
ALTER TABLE workflow_events ADD CONSTRAINT workflow_events_client_id_id_unique UNIQUE (client_id, id);

ALTER TABLE actions
    ADD CONSTRAINT actions_workflow_event_id_fk
    FOREIGN KEY (client_id, workflow_event_id)
    REFERENCES workflow_events(client_id, id)
    ON DELETE SET NULL;

-- errors.workflow_event_id -> workflow_events(client_id, id)
ALTER TABLE errors
    ADD CONSTRAINT errors_workflow_event_id_fk
    FOREIGN KEY (client_id, workflow_event_id)
    REFERENCES workflow_events(client_id, id)
    ON DELETE SET NULL;

-- errors.action_id -> actions(client_id, id)
ALTER TABLE actions ADD CONSTRAINT actions_client_id_id_unique UNIQUE (client_id, id);

ALTER TABLE errors
    ADD CONSTRAINT errors_action_id_fk
    FOREIGN KEY (client_id, action_id)
    REFERENCES actions(client_id, id)
    ON DELETE SET NULL;

-- ============================================================
-- client_members: Already has FK to clients(id)
-- But add composite for consistency
-- ============================================================
-- client_members already references clients(id) directly
-- For tenant isolation, we ensure client_id is part of the reference

-- ============================================================
-- Additional: Ensure client_id is NOT NULL on all tenant-scoped tables
-- ============================================================
-- All tenant-scoped tables already have client_id NOT NULL per initial schema

-- ============================================================
-- Indexes for composite FK performance
-- ============================================================
-- These indexes support the composite FK lookups
CREATE INDEX idx_leads_client_customer ON leads(client_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_estimates_client_customer ON estimates(client_id, customer_id);
CREATE INDEX idx_estimates_client_lead ON estimates(client_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_consents_client_customer ON consents(client_id, customer_id);
CREATE INDEX idx_conversations_client_customer ON conversations(client_id, customer_id);
CREATE INDEX idx_conversations_client_estimate ON conversations(client_id, estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_conversations_client_lead ON conversations(client_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_messages_client_conversation ON messages(client_id, conversation_id);
CREATE INDEX idx_messages_client_customer ON messages(client_id, customer_id);
CREATE INDEX idx_bookings_client_customer ON bookings(client_id, customer_id);
CREATE INDEX idx_bookings_client_estimate ON bookings(client_id, estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_bookings_client_lead ON bookings(client_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_bookings_client_conversation ON bookings(client_id, conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_actions_client_customer ON actions(client_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_actions_client_lead ON actions(client_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_actions_client_estimate ON actions(client_id, estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_actions_client_conversation ON actions(client_id, conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_actions_client_booking ON actions(client_id, booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_actions_client_workflow ON actions(client_id, workflow_event_id) WHERE workflow_event_id IS NOT NULL;
CREATE INDEX idx_errors_client_workflow ON errors(client_id, workflow_event_id) WHERE workflow_event_id IS NOT NULL;
CREATE INDEX idx_errors_client_action ON errors(client_id, action_id) WHERE action_id IS NOT NULL;