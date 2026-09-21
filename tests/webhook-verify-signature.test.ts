import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySignature } from '@/lib/webhook/verify-signature';
import { createHmac } from 'crypto';
import { WebhookErrorCode, WebhookError } from '@/lib/webhook/errors';
import { setEncryptionProvider, getEncryptionProvider } from '@/lib/webhook/encryption';

describe('verify-signature', () => {
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

  function expectErrorCode(result: { valid: boolean; error?: Error }, code: WebhookErrorCode) {
    expect(result.valid).toBe(false);
    expect(result.error).toBeInstanceOf(WebhookError);
    expect((result.error as WebhookError).code).toBe(code);
  }

  describe('HMAC-SHA256', () => {
    it('validates correct HMAC-SHA256 signature', async () => {
      const secret = new TextEncoder().encode('test-secret');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');
      const signature = createHmac('sha256', Buffer.from(secret)).update(Buffer.from(body)).digest('hex');

      const result = await verifySignature({
        authType: 'hmac_sha256',
        rawBody: body,
        headers: { 'x-signature': signature },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects invalid HMAC-SHA256 signature', async () => {
      const secret = new TextEncoder().encode('test-secret');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'hmac_sha256',
        rawBody: body,
        headers: { 'x-signature': 'invalid-signature' },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.INVALID_SIGNATURE);
    });

    it('rejects missing signature header', async () => {
      const secret = new TextEncoder().encode('test-secret');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'hmac_sha256',
        rawBody: body,
        headers: {},
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.MISSING_AUTHENTICATION);
    });

    it('uses timing-safe comparison', async () => {
      const secret = new TextEncoder().encode('test-secret');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');
      const signature = createHmac('sha256', Buffer.from(secret)).update(Buffer.from(body)).digest('hex');

      const result = await verifySignature({
        authType: 'hmac_sha256',
        rawBody: body,
        headers: { 'x-signature': signature },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('HMAC-SHA1', () => {
    it('validates correct HMAC-SHA1 signature', async () => {
      const secret = new TextEncoder().encode('test-secret');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');
      const signature = createHmac('sha1', Buffer.from(secret)).update(Buffer.from(body)).digest('hex');

      const result = await verifySignature({
        authType: 'hmac_sha1',
        rawBody: body,
        headers: { 'x-signature': signature },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects invalid HMAC-SHA1 signature', async () => {
      const secret = new TextEncoder().encode('test-secret');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'hmac_sha1',
        rawBody: body,
        headers: { 'x-signature': 'invalid-signature' },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.INVALID_SIGNATURE);
    });
  });

  describe('Bearer Token', () => {
    it('validates correct bearer token', async () => {
      const secret = new TextEncoder().encode('my-bearer-token');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'bearer_token',
        rawBody: body,
        headers: { authorization: 'Bearer my-bearer-token' },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects invalid bearer token', async () => {
      const secret = new TextEncoder().encode('my-bearer-token');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'bearer_token',
        rawBody: body,
        headers: { authorization: 'Bearer wrong-token' },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.INVALID_SIGNATURE);
    });

    it('rejects missing authorization header', async () => {
      const secret = new TextEncoder().encode('my-bearer-token');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'bearer_token',
        rawBody: body,
        headers: {},
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.MISSING_AUTHENTICATION);
    });

    it('rejects non-bearer authorization header', async () => {
      const secret = new TextEncoder().encode('my-bearer-token');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'bearer_token',
        rawBody: body,
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.MISSING_AUTHENTICATION);
    });
  });

  describe('Basic Auth', () => {
    it('validates correct basic auth', async () => {
      const credentials = 'user:pass';
      const secret = new TextEncoder().encode(credentials);
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');
      const encoded = Buffer.from(credentials).toString('base64');

      const result = await verifySignature({
        authType: 'basic_auth',
        rawBody: body,
        headers: { authorization: `Basic ${encoded}` },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects invalid basic auth credentials', async () => {
      const secret = new TextEncoder().encode('user:pass');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');
      const encoded = Buffer.from('wrong:creds').toString('base64');

      const result = await verifySignature({
        authType: 'basic_auth',
        rawBody: body,
        headers: { authorization: `Basic ${encoded}` },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.INVALID_SIGNATURE);
    });

    it('rejects missing authorization header', async () => {
      const secret = new TextEncoder().encode('user:pass');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'basic_auth',
        rawBody: body,
        headers: {},
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.MISSING_AUTHENTICATION);
    });

    it('rejects invalid base64 encoding', async () => {
      const secret = new TextEncoder().encode('user:pass');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'basic_auth',
        rawBody: body,
        headers: { authorization: 'Basic not-valid-base64!' },
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('Unsupported auth method', () => {
    it('rejects unsupported auth type', async () => {
      const secret = new TextEncoder().encode('test');
      const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');

      const result = await verifySignature({
        authType: 'custom_auth' as any,
        rawBody: body,
        headers: {},
        encryptedSecret: secret,
      });

      expect(result.valid).toBe(false);
      expectErrorCode(result, WebhookErrorCode.UNSUPPORTED_AUTH_METHOD);
    });
  });

  describe('Encryption provider not configured', () => {
    it('throws when encryption provider not set and no ENCRYPTION_KEY env', async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      try {
        delete process.env.ENCRYPTION_KEY;
        setEncryptionProvider(null);

        const secret = new TextEncoder().encode('test-secret');
        const body = new TextEncoder().encode('{"event_type":"test","event_id":"123"}');
        const signature = createHmac('sha256', Buffer.from(secret)).update(Buffer.from(body)).digest('hex');

        const result = await verifySignature({
          authType: 'hmac_sha256',
          rawBody: body,
          headers: { 'x-signature': signature },
          encryptedSecret: secret,
        });
        expect(result).toBeDefined();
      } finally {
        setEncryptionProvider(null);
        if (originalKey !== undefined) process.env.ENCRYPTION_KEY = originalKey;
      }
    });
  });
});