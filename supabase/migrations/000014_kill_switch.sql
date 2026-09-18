-- Migration: 000014_kill_switch.sql
-- Description: Add kill switch column to clients for instant tenant-level execution halt
-- Depends on: 000001_initial_schema.sql through 000013_webhook_ingestion.sql

-- ============================================================
-- A. Add kill_switch_enabled column to clients table
-- ============================================================
ALTER TABLE clients ADD COLUMN kill_switch_enabled boolean NOT NULL DEFAULT false;

-- Partial index for fast lookup of active kill switches
CREATE INDEX idx_clients_kill_switch ON clients(kill_switch_enabled) WHERE kill_switch_enabled = true;

-- ============================================================
-- B. RLS policy update (if needed)
-- ============================================================
-- The existing clients RLS policies already allow SELECT for tenant members.
-- No new policies needed since kill_switch_enabled is read via existing SELECT policy.

-- ============================================================
-- C. Grant permissions
-- ============================================================
-- The authenticated role already has SELECT/UPDATE on clients via existing grants.
-- No new GRANTs needed.
