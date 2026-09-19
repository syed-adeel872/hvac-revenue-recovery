import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwilioMessagingAdapter } from '@/lib/messaging/twilio';
import { DispatchParams } from '@/lib/workers/execution/types';

describe('TwilioMessagingAdapter', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const defaultConfig = {
    accountSid: 'AC1234567890abcdef',
    authToken: 'auth-token-123',
    fromNumber: '+15551234567',
    statusCallbackUrl: 'https://example.com/api/v1/webhooks/twilio/status',
  };

  const smsParams: DispatchParams = {
    channel: 'sms',
    to: '+15559876543',
    content: 'Hello! Would you like to schedule a follow-up?',
    clientId: 'client-1',
    customerId: 'customer-1',
    conversationId: 'conv-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
  });

  describe('send SMS', () => {
    it('sends SMS successfully via Twilio API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sid: 'SM1234567890abcdef',
          status: 'queued',
          to: '+15559876543',
          from: '+15551234567',
          body: 'Hello!',
          dateCreated: '2024-01-15T10:00:00Z',
          dateUpdated: '2024-01-15T10:00:00Z',
          errorCode: null,
          errorMessage: null,
        }),
      });

      const adapter = new TwilioMessagingAdapter(defaultConfig, mockFetch as any);
      const result = await adapter.send(smsParams);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('SM1234567890abcdef');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twilio.com/2010-04-01/Accounts/AC1234567890abcdef/Messages.json',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes StatusCallback URL in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SM123', status: 'queued' }),
      });

      const adapter = new TwilioMessagingAdapter(defaultConfig, mockFetch as any);
      await adapter.send(smsParams);

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('StatusCallback');
    });

    it('rejects non-SMS channels', async () => {
      const adapter = new TwilioMessagingAdapter(defaultConfig, mockFetch as any);
      const result = await adapter.send({ ...smsParams, channel: 'email' });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNSUPPORTED_CHANNEL');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles Twilio API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          code: 21211,
          message: 'The To number is not a valid phone number.',
        }),
      });

      const adapter = new TwilioMessagingAdapter(defaultConfig, mockFetch as any);
      const result = await adapter.send(smsParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a valid phone number');
      expect(result.errorCode).toBe('21211');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const adapter = new TwilioMessagingAdapter(defaultConfig, mockFetch as any);
      const result = await adapter.send(smsParams);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TWILIO_NETWORK_ERROR');
    });

    it('constructs correct Basic auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SM123', status: 'queued' }),
      });

      const adapter = new TwilioMessagingAdapter(defaultConfig, mockFetch as any);
      await adapter.send(smsParams);

      const authHeader = mockFetch.mock.calls[0][1].headers['Authorization'];
      expect(authHeader).toMatch(/^Basic /);
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      expect(decoded).toBe(`${defaultConfig.accountSid}:${defaultConfig.authToken}`);
    });
  });

  describe('Twilio signature validation', () => {
    it('validates correct Twilio signature', () => {
      const requestUrl = 'https://example.com/api/v1/webhooks/twilio';
      const params: Record<string, string> = { MessageSid: 'SM1234567890', Body: 'Hello', From: '+15559876543', To: '+15551234567' };
      const authToken = 'test-auth-token';

      const crypto = require('crypto');
      let data = requestUrl;
      for (const key of Object.keys(params).sort()) {
        data += key + params[key];
      }
      const sig = crypto.createHmac('sha1', authToken).update(data).digest('base64');

      expect(TwilioMessagingAdapter.validateTwilioSignature(requestUrl, params, sig, authToken)).toBe(true);
    });

    it('rejects invalid Twilio signature', () => {
      const params: Record<string, string> = { MessageSid: 'SM123', Body: 'Hello' };
      const isValid = TwilioMessagingAdapter.validateTwilioSignature(
        'https://example.com/webhook',
        params,
        'invalid-sig',
        'test-token'
      );
      expect(isValid).toBe(false);
    });

    it('rejects signature with wrong auth token', () => {
      const crypto = require('crypto');
      const requestUrl = 'https://example.com/webhook';
      const params: Record<string, string> = { MessageSid: 'SM123', Body: 'Hello' };
      let data = requestUrl;
      for (const key of Object.keys(params).sort()) {
        data += key + params[key];
      }
      const sig = crypto.createHmac('sha1', 'wrong-token').update(data).digest('base64');

      expect(TwilioMessagingAdapter.validateTwilioSignature(requestUrl, params, sig, 'correct-token')).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('creates adapter with minimal config', () => {
      const adapter = new TwilioMessagingAdapter({
        accountSid: 'AC123',
        authToken: 'token',
        fromNumber: '+15551234567',
      });
      expect(adapter).toBeDefined();
    });
  });
});
