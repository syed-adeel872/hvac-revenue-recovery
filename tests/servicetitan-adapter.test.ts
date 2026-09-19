import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceTitanAdapter } from '@/lib/webhook/adapters/servicetitan';
import { validateServiceTitanPayload } from '@/lib/webhook/servicetitan-schema';
import { createHmac } from 'crypto';
import { WebhookErrorCode, WebhookError } from '@/lib/webhook/errors';
import { setEncryptionProvider } from '@/lib/webhook/encryption';

describe('ServiceTitan adapter', () => {
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = {
      async decrypt(data: Uint8Array): Promise<Uint8Array> {
        return data;
      },
      async encrypt(data: Uint8Array): Promise<Uint8Array> {
        return data;
      },
    };
    setEncryptionProvider(mockProvider);
  });

  afterEach(() => {
    setEncryptionProvider(null);
  });

  const validPayload = {
    Type: 'EstimateUnbooked',
    CorrelationId: 'corr-123-abc',
    Timestamp: '2024-01-15T10:30:00Z',
    Data: {
      EstimateId: 'est-456',
      CustomerId: 'cust-789',
      EstimatedValue: 2500.00,
      Technician: 'John Smith',
    },
  };

  const validBody = new TextEncoder().encode(JSON.stringify(validPayload));
  const secret = new TextEncoder().encode('servicetitan-webhook-secret');
  const validSignature = createHmac('sha256', Buffer.from(secret))
    .update(Buffer.from(validBody))
    .digest('hex');

  describe('HMAC verification', () => {
    it('verifies valid HMAC-SHA256 signature', async () => {
      const adapter = new ServiceTitanAdapter();
      const result = await adapter.verify(
        validBody,
        { 'x-st-webhook-signature': validSignature },
        secret
      );
      expect(result.valid).toBe(true);
    });

    it('rejects invalid HMAC-SHA256 signature', async () => {
      const adapter = new ServiceTitanAdapter();
      const result = await adapter.verify(
        validBody,
        { 'x-st-webhook-signature': 'invalid-signature' },
        secret
      );
      expect(result.valid).toBe(false);
      expect((result.error as WebhookError)?.code).toBe(WebhookErrorCode.INVALID_SIGNATURE);
    });

    it('rejects missing signature header', async () => {
      const adapter = new ServiceTitanAdapter();
      const result = await adapter.verify(validBody, {}, secret);
      expect(result.valid).toBe(false);
      expect((result.error as WebhookError)?.code).toBe(WebhookErrorCode.MISSING_AUTHENTICATION);
    });

    it('uses custom signature header name', async () => {
      const adapter = new ServiceTitanAdapter({ signatureHeader: 'x-custom-sig' });
      const result = await adapter.verify(
        validBody,
        { 'x-custom-sig': validSignature },
        secret
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Event info extraction', () => {
    it('extracts event info from valid payload', () => {
      const adapter = new ServiceTitanAdapter();
      const info = adapter.extractEventInfo(validBody);

      expect(info.providerEventType).toBe('EstimateUnbooked');
      expect(info.externalEventId).toBe('corr-123-abc');
      expect(info.providerTimestamp).toBeInstanceOf(Date);
      expect(info.providerTimestamp?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
      expect(info.idempotencyInput).toContain('EstimateUnbooked');
      expect(info.idempotencyInput).toContain('corr-123-abc');
    });

    it('includes validated event data', () => {
      const adapter = new ServiceTitanAdapter();
      const info = adapter.extractEventInfo(validBody);

      expect(info.validatedEvent.eventType).toBe('EstimateUnbooked');
      expect(info.validatedEvent.correlationId).toBe('corr-123-abc');
      expect(info.validatedEvent.data).toEqual(validPayload.Data);
    });

    it('handles payload with empty Data field', () => {
      const payload = {
        Type: 'JobCompleted',
        CorrelationId: 'corr-456',
        Timestamp: '2024-01-15T11:00:00Z',
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));
      const adapter = new ServiceTitanAdapter();
      const info = adapter.extractEventInfo(body);

      expect(info.providerEventType).toBe('JobCompleted');
      expect(info.validatedEvent.data).toEqual({});
    });

    it('generates consistent idempotency input', () => {
      const adapter = new ServiceTitanAdapter();
      const info1 = adapter.extractEventInfo(validBody);
      const info2 = adapter.extractEventInfo(validBody);

      expect(info1.idempotencyInput).toBe(info2.idempotencyInput);
    });

    it('generates different idempotency inputs for different events', () => {
      const adapter = new ServiceTitanAdapter();
      const body1 = new TextEncoder().encode(JSON.stringify({
        Type: 'EstimateUnbooked',
        CorrelationId: 'corr-1',
        Timestamp: '2024-01-15T10:00:00Z',
      }));
      const body2 = new TextEncoder().encode(JSON.stringify({
        Type: 'JobCompleted',
        CorrelationId: 'corr-2',
        Timestamp: '2024-01-15T10:00:00Z',
      }));

      const info1 = adapter.extractEventInfo(body1);
      const info2 = adapter.extractEventInfo(body2);

      expect(info1.idempotencyInput).not.toBe(info2.idempotencyInput);
    });
  });

  describe('Schema validation', () => {
    it('validates correct ServiceTitan payload', () => {
      const event = validateServiceTitanPayload(validBody);
      expect(event.eventType).toBe('EstimateUnbooked');
      expect(event.correlationId).toBe('corr-123-abc');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('rejects payload missing Type field', () => {
      const payload = { CorrelationId: 'corr-123', Timestamp: '2024-01-15T10:00:00Z' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => validateServiceTitanPayload(body)).toThrow();
    });

    it('rejects payload missing CorrelationId field', () => {
      const payload = { Type: 'EstimateUnbooked', Timestamp: '2024-01-15T10:00:00Z' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => validateServiceTitanPayload(body)).toThrow();
    });

    it('rejects payload missing Timestamp field', () => {
      const payload = { Type: 'EstimateUnbooked', CorrelationId: 'corr-123' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => validateServiceTitanPayload(body)).toThrow();
    });

    it('rejects invalid JSON', () => {
      const body = new TextEncoder().encode('not-json');

      expect(() => validateServiceTitanPayload(body)).toThrow();
    });

    it('rejects invalid timestamp', () => {
      const payload = {
        Type: 'EstimateUnbooked',
        CorrelationId: 'corr-123',
        Timestamp: 'not-a-date',
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => validateServiceTitanPayload(body)).toThrow();
    });

    it('accepts various EventTypes', () => {
      const eventTypes = [
        'EstimateUnbooked',
        'JobCompleted',
        'AppointmentCreated',
        'CustomerCreated',
        'CustomEventType',
      ];

      for (const eventType of eventTypes) {
        const payload = {
          Type: eventType,
          CorrelationId: 'corr-123',
          Timestamp: '2024-01-15T10:00:00Z',
        };
        const body = new TextEncoder().encode(JSON.stringify(payload));
        const event = validateServiceTitanPayload(body);
        expect(event.eventType).toBe(eventType);
      }
    });
  });
});
