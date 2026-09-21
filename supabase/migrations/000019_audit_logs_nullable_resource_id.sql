-- Migration: 000019_audit_logs_nullable_resource_id
-- Description: Make audit_logs.resource_id nullable for system-level events (e.g. kill switch)
--              that don't have a specific entity uuid.

ALTER TABLE audit_logs ALTER COLUMN resource_id DROP NOT NULL;
