import { describe, it, expect } from 'vitest';
import { validateWebhookPayload, validateProviderConfig } from '@/lib/webhook/validate-schema';
import { WebhookErrorCode } from '@/lib/webhook/errors';

describe('validate-schema', () => {
  describe('validateWebhookPayload', () => {
    it('validates correct payload', () => {
      const payload = {
        event_type: 'order.created',
        event_id: 'evt_123',
        timestamp: '2024-01-15T10:00:00Z',
        payload: { order_id: 'ord_123', amount: 100 },
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const result = validateWebhookPayload(body);

      expect(result.providerEventType).toBe('order.created');
      expect(result.externalEventId).toBe('evt_123');
      expect(result.providerTimestamp).toBeInstanceOf(Date);
      expect(result.rawPayload).toEqual({ order_id: 'ord_123', amount: 100 });
    });

    it('validates payload without optional fields', () => {
      const payload = {
        event_type: 'order.created',
        event_id: 'evt_123',
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const result = validateWebhookPayload(body);

      expect(result.providerEventType).toBe('order.created');
      expect(result.externalEventId).toBe('evt_123');
      expect(result.providerTimestamp).toBeUndefined();
      expect(result.rawPayload).toEqual({});
    });

    it('rejects malformed JSON', () => {
      const body = new TextEncoder().encode('not valid json');

      expect(() => validateWebhookPayload(body)).toThrow();
      try {
        validateWebhookPayload(body);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.MALFORMED_JSON);
      }
    });

    it('rejects missing event_type', () => {
      const payload = { event_id: 'evt_123' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => validateWebhookPayload(body)).toThrow();
      try {
        validateWebhookPayload(body);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.SCHEMA_VALIDATION_FAILED);
      }
    });

    it('rejects missing event_id', () => {
      const payload = { event_type: 'order.created' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      expect(() => validateWebhookPayload(body)).toThrow();
      try {
        validateWebhookPayload(body);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.SCHEMA_VALIDATION_FAILED);
      }
    });

    it('rejects oversized payload', () => {
      const largePayload = {
        event_type: 'order.created',
        event_id: 'evt_123',
        payload: { data: 'x'.repeat(2 * 1024 * 1024) },
      };
      const body = new TextEncoder().encode(JSON.stringify(largePayload));

      expect(() => validateWebhookPayload(body)).toThrow();
      try {
        validateWebhookPayload(body);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.PAYLOAD_TOO_LARGE);
      }
    });

    it('parses numeric timestamp as milliseconds when large', () => {
      const payload = {
        event_type: 'order.created',
        event_id: 'evt_123',
        timestamp: Date.now(),
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const result = validateWebhookPayload(body);
      expect(result.providerTimestamp).toBeInstanceOf(Date);
    });

    it('parses numeric timestamp as seconds when small', () => {
      const payload = {
        event_type: 'order.created',
        event_id: 'evt_123',
        timestamp: Math.floor(Date.now() / 1000),
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const result = validateWebhookPayload(body);
      expect(result.providerTimestamp).toBeInstanceOf(Date);
    });
  });

  describe('validateProviderConfig', () => {
    it('validates correct provider config', () => {
      const config = {
        provider_name: 'test-provider',
        auth_type: 'hmac_sha256',
        event_type_mapping: { 'order.created': 'internal.order_created' },
        tenant_resolution: { strategy: 'credential_based' },
        max_payload_size_bytes: 1024 * 1024,
        header_name: 'x-signature',
      };

      const result = validateProviderConfig(config);

      expect(result.providerName).toBe('test-provider');
      expect(result.authType).toBe('hmac_sha256');
      expect(result.eventTypeMapping).toEqual({ 'order.created': 'internal.order_created' });
      expect(result.tenantResolution.strategy).toBe('credential_based');
      expect(result.maxPayloadSizeBytes).toBe(1024 * 1024);
      expect(result.headerName).toBe('x-signature');
    });

    it('uses defaults for optional fields', () => {
      const config = {
        provider_name: 'test-provider',
        auth_type: 'bearer_token',
      };

      const result = validateProviderConfig(config);

      expect(result.providerName).toBe('test-provider');
      expect(result.authType).toBe('bearer_token');
      expect(result.eventTypeMapping).toEqual({});
      expect(result.tenantResolution.strategy).toBe('credential_based');
      expect(result.maxPayloadSizeBytes).toBe(1024 * 1024);
      expect(result.headerName).toBeUndefined();
    });

    it('rejects invalid auth_type', () => {
      const config = {
        provider_name: 'test-provider',
        auth_type: 'invalid_auth',
      };

      expect(() => validateProviderConfig(config)).toThrow();
      try {
        validateProviderConfig(config);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.INVALID_REQUEST);
      }
    });

    it('rejects missing provider_name', () => {
      const config = {
        auth_type: 'hmac_sha256',
      };

      expect(() => validateProviderConfig(config)).toThrow();
      try {
        validateProviderConfig(config);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.INVALID_REQUEST);
      }
    });
  });
});