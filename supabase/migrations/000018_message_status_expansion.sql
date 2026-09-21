-- Migration 000018: Add processing/processed statuses to messages table
-- The inbound message processing code uses 'processing' and 'processed' statuses
-- that were not included in the original CHECK constraint from 000002.

BEGIN;

-- Drop the old CHECK constraint and add the expanded one
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE messages ADD CONSTRAINT messages_status_check
    CHECK (status IN ('pending', 'received', 'processing', 'processed', 'sent', 'delivered', 'failed'));

COMMIT;
