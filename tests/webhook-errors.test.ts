import { describe, it, expect } from 'vitest';
import { WebhookErrorCode, createError, mapErrorToResponse } from '@/lib/webhook/errors';

describe('errors', () => {
  describe('createError', () => {
    it('creates error with correct properties', () => {
      const error = createError(
        WebhookErrorCode.INVALID_SIGNATURE,
        'Internal error message',
        'Safe external message',
        { detail: 'extra info' }
      );

      expect(error.code).toBe(WebhookErrorCode.INVALID_SIGNATURE);
      expect(error.message).toBe('Internal error message');
      expect(error.safeMessage).toBe('Safe external message');
      expect(error.details).toEqual({ detail: 'extra info' });
      expect(error.statusCode).toBe(401);
    });

    it('uses message as safeMessage when not provided', () => {
      const error = createError(WebhookErrorCode.INVALID_REQUEST, 'Error message');

      expect(error.safeMessage).toBe('Error message');
    });

    it('maps all error codes to correct status codes', () => {
      const statusMap: Record<WebhookErrorCode, number> = {
        [WebhookErrorCode.INVALID_REQUEST]: 400,
        [WebhookErrorCode.PAYLOAD_TOO_LARGE]: 413,
        [WebhookErrorCode.MALFORMED_JSON]: 400,
        [WebhookErrorCode.UNSUPPORTED_PROVIDER]: 404,
        [WebhookErrorCode.PROVIDER_NOT_CONFIGURED]: 404,
        [WebhookErrorCode.MISSING_AUTHENTICATION]: 401,
        [WebhookErrorCode.INVALID_SIGNATURE]: 401,
        [WebhookErrorCode.INVALID_CREDENTIALS]: 401,
        [WebhookErrorCode.UNSUPPORTED_AUTH_METHOD]: 400,
        [WebhookErrorCode.REPLAY_ATTACK]: 409,
        [WebhookErrorCode.STALE_REQUEST]: 401,
        [WebhookErrorCode.FUTURE_REQUEST]: 401,
        [WebhookErrorCode.SCHEMA_VALIDATION_FAILED]: 400,
        [WebhookErrorCode.TENANT_MISMATCH]: 403,
        [WebhookErrorCode.CROSS_TENANT_REJECTED]: 403,
        [WebhookErrorCode.IDEMPOTENCY_CONFLICT]: 409,
        [WebhookErrorCode.PERSISTENCE_FAILED]: 500,
        [WebhookErrorCode.INTERNAL_ERROR]: 500,
      };

      for (const [code, expectedStatus] of Object.entries(statusMap)) {
        const error = createError(code as WebhookErrorCode, 'test');
        expect(error.statusCode).toBe(expectedStatus);
      }
    });
  });

  describe('mapErrorToResponse', () => {
    it('maps WebhookError to response', () => {
      const error = createError(WebhookErrorCode.INVALID_SIGNATURE, 'Internal', 'Safe message', { detail: 'info' });

      const response = mapErrorToResponse(error);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Safe message',
        code: WebhookErrorCode.INVALID_SIGNATURE,
        details: { detail: 'info' },
      });
    });

    it('maps generic Error to 500', () => {
      const error = new Error('Generic error');

      const response = mapErrorToResponse(error);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Internal server error',
        code: WebhookErrorCode.INTERNAL_ERROR,
      });
    });

    it('maps unknown error to 500', () => {
      const response = mapErrorToResponse('string error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Internal server error',
        code: WebhookErrorCode.INTERNAL_ERROR,
      });
    });

    it('does not expose internal details in safe message', () => {
      const error = createError(
        WebhookErrorCode.INVALID_CREDENTIALS,
        'Internal: decryption failed with key abc123',
        'Invalid credentials'
      );

      const response = mapErrorToResponse(error);

      expect(response.body.error).toBe('Invalid credentials');
      expect(response.body.error).not.toContain('abc123');
      expect(response.body.error).not.toContain('decryption');
    });
  });
});