import { describe, it, expect } from 'vitest';
import { redactHeaders, persistIngestionEvent } from '@/lib/webhook/persistence';

describe('persistence', () => {
  describe('redactHeaders', () => {
    it('redacts authorization header', () => {
      const headers = {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result.authorization).toBe('[REDACTED]');
      expect(result['content-type']).toBe('application/json');
    });

    it('redacts x-signature header', () => {
      const headers = {
        'x-signature': 'sha256=abc123',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-signature']).toBe('[REDACTED]');
    });

    it('redacts x-webhook-signature header', () => {
      const headers = {
        'x-webhook-signature': 'secret',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-webhook-signature']).toBe('[REDACTED]');
    });

    it('redacts x-hub-signature header', () => {
      const headers = {
        'x-hub-signature': 'sha1=secret',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-hub-signature']).toBe('[REDACTED]');
    });

    it('redacts x-hub-signature-256 header', () => {
      const headers = {
        'x-hub-signature-256': 'sha256=secret',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-hub-signature-256']).toBe('[REDACTED]');
    });

    it('redacts stripe-signature header', () => {
      const headers = {
        'stripe-signature': 'secret',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['stripe-signature']).toBe('[REDACTED]');
    });

    it('redacts x-github-delivery and x-github-event', () => {
      const headers = {
        'x-github-delivery': 'delivery-id',
        'x-github-event': 'push',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-github-delivery']).toBe('[REDACTED]');
      expect(result['x-github-event']).toBe('[REDACTED]');
    });

    it('redacts x-gitlab-event', () => {
      const headers = {
        'x-gitlab-event': 'push',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-gitlab-event']).toBe('[REDACTED]');
    });

    it('redacts x-shopify-hmac-sha256', () => {
      const headers = {
        'x-shopify-hmac-sha256': 'secret',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-shopify-hmac-sha256']).toBe('[REDACTED]');
    });

    it('redacts x-twilio-signature', () => {
      const headers = {
        'x-twilio-signature': 'secret',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-twilio-signature']).toBe('[REDACTED]');
    });

    it('redacts x-slack-signature and x-slack-request-timestamp', () => {
      const headers = {
        'x-slack-signature': 'secret',
        'x-slack-request-timestamp': '1234567890',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-slack-signature']).toBe('[REDACTED]');
      expect(result['x-slack-request-timestamp']).toBe('[REDACTED]');
    });

    it('redacts any x-* header containing "sign"', () => {
      const headers = {
        'x-custom-signature': 'secret',
        'x-another-sign-header': 'secret',
        'x-normal-header': 'value',
        'content-type': 'application/json',
      };

      const result = redactHeaders(headers);

      expect(result['x-custom-signature']).toBe('[REDACTED]');
      expect(result['x-another-sign-header']).toBe('[REDACTED]');
      expect(result['x-normal-header']).toBe('value');
    });

    it('preserves non-sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-request-id': 'req_123',
        'accept': '*/*',
      };

      const result = redactHeaders(headers);

      expect(result).toEqual(headers);
    });
  });

  describe('persistIngestionEvent', () => {
    it('requires supabase client', async () => {
      // This is an integration test that requires a real supabase client
      // We just verify the function exists and has the right signature
      expect(typeof persistIngestionEvent).toBe('function');
    });
  });
});