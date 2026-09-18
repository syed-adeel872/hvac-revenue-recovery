import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeIdempotencyKey, computeIdempotencyKeyFromAdapterInput } from '@/lib/webhook/idempotency';

describe('idempotency', () => {
  describe('computeIdempotencyKey', () => {
    it('produces deterministic key from same components', () => {
      const components = {
        providerId: 'provider_123',
        externalEventId: 'evt_456',
        providerTimestamp: new Date('2024-01-15T10:00:00Z'),
      };

      const key1 = computeIdempotencyKey(components);
      const key2 = computeIdempotencyKey(components);

      expect(key1).toBe(key2);
      expect(key1.length).toBe(64);
    });

    it('produces different keys for different provider IDs', () => {
      const key1 = computeIdempotencyKey({ providerId: 'provider_1', externalEventId: 'evt_123' });
      const key2 = computeIdempotencyKey({ providerId: 'provider_2', externalEventId: 'evt_123' });

      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different external event IDs', () => {
      const key1 = computeIdempotencyKey({ providerId: 'provider_1', externalEventId: 'evt_1' });
      const key2 = computeIdempotencyKey({ providerId: 'provider_1', externalEventId: 'evt_2' });

      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different timestamps', () => {
      const key1 = computeIdempotencyKey({
        providerId: 'provider_1',
        externalEventId: 'evt_123',
        providerTimestamp: new Date('2024-01-15T10:00:00Z'),
      });
      const key2 = computeIdempotencyKey({
        providerId: 'provider_1',
        externalEventId: 'evt_123',
        providerTimestamp: new Date('2024-01-15T11:00:00Z'),
      });

      expect(key1).not.toBe(key2);
    });

    it('works without timestamp', () => {
      const key1 = computeIdempotencyKey({ providerId: 'provider_1', externalEventId: 'evt_123' });
      const key2 = computeIdempotencyKey({ providerId: 'provider_1', externalEventId: 'evt_123' });

      expect(key1).toBe(key2);
      expect(key1.length).toBe(64);
    });
  });

  describe('computeIdempotencyKeyFromAdapterInput', () => {
    it('produces deterministic key', () => {
      const key1 = computeIdempotencyKeyFromAdapterInput('order.created|evt_123|2024-01-15T10:00:00.000Z', 'provider_123');
      const key2 = computeIdempotencyKeyFromAdapterInput('order.created|evt_123|2024-01-15T10:00:00.000Z', 'provider_123');

      expect(key1).toBe(key2);
      expect(key1.length).toBe(64);
    });

    it('produces different keys for different adapter inputs', () => {
      const key1 = computeIdempotencyKeyFromAdapterInput('order.created|evt_123', 'provider_123');
      const key2 = computeIdempotencyKeyFromAdapterInput('order.updated|evt_123', 'provider_123');

      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different provider IDs', () => {
      const key1 = computeIdempotencyKeyFromAdapterInput('order.created|evt_123', 'provider_1');
      const key2 = computeIdempotencyKeyFromAdapterInput('order.created|evt_123', 'provider_2');

      expect(key1).not.toBe(key2);
    });
  });
});