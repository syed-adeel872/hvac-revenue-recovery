-- Migration: 000020_grant_service_role_permissions.sql
-- Description: Grant service_role proper permissions on all tables and schema
-- This fixes "permission denied for schema public" errors when using the service role key
-- Depends on: all prior migrations

-- Grant USAGE on the public schema to service_role
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant full table access to service_role for all existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure future tables also get grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
