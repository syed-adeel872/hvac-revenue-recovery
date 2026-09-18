import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericHMACAdapter } from '@/lib/webhook/adapters/generic-hmac';
import { BearerTokenAdapter } from '@/lib/webhook/adapters/bearer-token';
import { BasicAuthAdapter } from '@/lib/webhook/adapters/basic-auth';
import { createHmac } from 'crypto';
import { WebhookErrorCode } from '@/lib/webhook/errors';
import { setEncryptionProvider } from '@/lib/webhook/encryption';

describe('provider adapters', () => {
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

  const baseConfig = {
    headerName: 'x-signature',
    eventTypeField: 'event_type',
    externalEventIdField: 'event_id',
    timestampField: 'timestamp',
  };

  const validPayload = { event_type: 'order.created', event_id: 'evt_123', timestamp: '2024-01-15T10:00:00Z' };
  const validBody = new TextEncoder().encode(JSON.stringify(validPayload));
  const secret = new TextEncoder().encode('test-secret');
  const validSignature = createHmac('sha256', Buffer.from(secret)).update(Buffer.from(validBody)).digest('hex');

  describe('GenericHMACAdapter', () => {
    let adapter: GenericHMACAdapter;

    beforeEach(() => {
      adapter = new GenericHMACAdapter(baseConfig);
    });

    it('verifies valid HMAC-SHA256 signature', async () => {
      const result = await adapter.verify(validBody, { 'x-signature': validSignature }, secret);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid HMAC-SHA256 signature', async () => {
      const result = await adapter.verify(validBody, { 'x-signature': 'invalid' }, secret);
      expect(result.valid).toBe(false);
    });

    it('extracts event info correctly', () => {
      const info = adapter.extractEventInfo(validBody);
      expect(info.providerEventType).toBe('order.created');
      expect(info.externalEventId).toBe('evt_123');
      expect(info.providerTimestamp).toBeInstanceOf(Date);
      expect(info.idempotencyInput).toContain('order.created');
      expect(info.idempotencyInput).toContain('evt_123');
    });

    it('throws on missing event_type', () => {
      const payload = { event_id: 'evt_123' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => adapter.extractEventInfo(body)).toThrow();
    });

    it('throws on missing event_id', () => {
      const payload = { event_type: 'order.created' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => adapter.extractEventInfo(body)).toThrow();
    });

    it('handles nested field paths', () => {
      const adapter2 = new GenericHMACAdapter({
        ...baseConfig,
        eventTypeField: 'data.event_type',
        externalEventIdField: 'data.event_id',
      });

      const payload = { data: { event_type: 'nested.event', event_id: 'nested_123' } };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const info = adapter2.extractEventInfo(body);
      expect(info.providerEventType).toBe('nested.event');
      expect(info.externalEventId).toBe('nested_123');
    });
  });

  describe('BearerTokenAdapter', () => {
    let adapter: BearerTokenAdapter;

    beforeEach(() => {
      adapter = new BearerTokenAdapter({
        eventTypeField: 'event_type',
        externalEventIdField: 'event_id',
        timestampField: 'timestamp',
      });
    });

    it('verifies valid bearer token', async () => {
      const tokenSecret = new TextEncoder().encode('my-token');
      const result = await adapter.verify(validBody, { authorization: 'Bearer my-token' }, tokenSecret);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid bearer token', async () => {
      const tokenSecret = new TextEncoder().encode('my-token');
      const result = await adapter.verify(validBody, { authorization: 'Bearer wrong' }, tokenSecret);
      expect(result.valid).toBe(false);
    });

    it('extracts event info correctly', () => {
      const info = adapter.extractEventInfo(validBody);
      expect(info.providerEventType).toBe('order.created');
      expect(info.externalEventId).toBe('evt_123');
    });
  });

  describe('BasicAuthAdapter', () => {
    let adapter: BasicAuthAdapter;

    beforeEach(() => {
      adapter = new BasicAuthAdapter({
        eventTypeField: 'event_type',
        externalEventIdField: 'event_id',
        timestampField: 'timestamp',
      });
    });

    it('verifies valid basic auth', async () => {
      const creds = 'user:pass';
      const secret = new TextEncoder().encode(creds);
      const encoded = Buffer.from(creds).toString('base64');
      const result = await adapter.verify(validBody, { authorization: `Basic ${encoded}` }, secret);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid basic auth', async () => {
      const secret = new TextEncoder().encode('user:pass');
      const encoded = Buffer.from('wrong:creds').toString('base64');
      const result = await adapter.verify(validBody, { authorization: `Basic ${encoded}` }, secret);
      expect(result.valid).toBe(false);
    });

    it('extracts event info correctly', () => {
      const info = adapter.extractEventInfo(validBody);
      expect(info.providerEventType).toBe('order.created');
      expect(info.externalEventId).toBe('evt_123');
    });
  });

  describe('Idempotency input computation', () => {
    it('produces same key for same inputs', () => {
      const adapter = new GenericHMACAdapter(baseConfig);
      const info1 = adapter.extractEventInfo(validBody);
      const info2 = adapter.extractEventInfo(validBody);

      expect(info1.idempotencyInput).toBe(info2.idempotencyInput);
    });

    it('produces different keys for different event types', () => {
      const adapter = new GenericHMACAdapter(baseConfig);
      const payload1 = { event_type: 'type.a', event_id: 'evt_123' };
      const payload2 = { event_type: 'type.b', event_id: 'evt_123' };
      const body1 = new TextEncoder().encode(JSON.stringify(payload1));
      const body2 = new TextEncoder().encode(JSON.stringify(payload2));

      const info1 = adapter.extractEventInfo(body1);
      const info2 = adapter.extractEventInfo(body2);

      expect(info1.idempotencyInput).not.toBe(info2.idempotencyInput);
    });

    it('produces different keys for different event IDs', () => {
      const adapter = new GenericHMACAdapter(baseConfig);
      const payload1 = { event_type: 'order.created', event_id: 'evt_1' };
      const payload2 = { event_type: 'order.created', event_id: 'evt_2' };
      const body1 = new TextEncoder().encode(JSON.stringify(payload1));
      const body2 = new TextEncoder().encode(JSON.stringify(payload2));

      const info1 = adapter.extractEventInfo(body1);
      const info2 = adapter.extractEventInfo(body2);

      expect(info1.idempotencyInput).not.toBe(info2.idempotencyInput);
    });

    it('includes timestamp when available', () => {
      const adapter = new GenericHMACAdapter(baseConfig);
      const payload1 = { event_type: 'order.created', event_id: 'evt_123', timestamp: '2024-01-15T10:00:00Z' };
      const payload2 = { event_type: 'order.created', event_id: 'evt_123', timestamp: '2024-01-15T11:00:00Z' };
      const body1 = new TextEncoder().encode(JSON.stringify(payload1));
      const body2 = new TextEncoder().encode(JSON.stringify(payload2));

      const info1 = adapter.extractEventInfo(body1);
      const info2 = adapter.extractEventInfo(body2);

      expect(info1.idempotencyInput).not.toBe(info2.idempotencyInput);
    });
  });
});