import { describe, it, expect } from 'vitest';
import { validateTimestamp, createReplayConfig } from '@/lib/webhook/replay';
import { WebhookErrorCode, WebhookError } from '@/lib/webhook/errors';

describe('replay', () => {
  function expectErrorCode(result: { valid: boolean; error?: Error }, code: WebhookErrorCode) {
    expect(result.valid).toBe(false);
    expect(result.error).toBeInstanceOf(WebhookError);
    expect((result.error as WebhookError).code).toBe(code);
  }
  describe('validateTimestamp', () => {
    it('passes when replay protection disabled', () => {
      const result = validateTimestamp(new Date(), { enabled: false });
      expect(result.valid).toBe(true);
    });

    it('passes when no timestamp provided', () => {
      const result = validateTimestamp(undefined, { enabled: true });
      expect(result.valid).toBe(true);
    });

    it('passes for valid recent timestamp', () => {
      const recent = new Date(Date.now() - 60 * 1000);
      const result = validateTimestamp(recent, { enabled: true, maxAgeSeconds: 300 });
      expect(result.valid).toBe(true);
    });

    it('rejects stale timestamp', () => {
      const stale = new Date(Date.now() - 10 * 60 * 1000);
      const result = validateTimestamp(stale, { enabled: true, maxAgeSeconds: 300 });

      expectErrorCode(result, WebhookErrorCode.STALE_REQUEST);
    });

    it('rejects future timestamp beyond threshold', () => {
      const future = new Date(Date.now() + 120 * 1000);
      const result = validateTimestamp(future, { enabled: true, maxFutureSeconds: 60 });

      expectErrorCode(result, WebhookErrorCode.FUTURE_REQUEST);
    });

    it('passes for slightly future timestamp within threshold', () => {
      const future = new Date(Date.now() + 30 * 1000);
      const result = validateTimestamp(future, { enabled: true, maxFutureSeconds: 60 });
      expect(result.valid).toBe(true);
    });

    it('uses custom max age', () => {
      const timestamp = new Date(Date.now() - 200 * 1000);
      const result = validateTimestamp(timestamp, { enabled: true, maxAgeSeconds: 180 });
      expect(result.valid).toBe(false);

      const result2 = validateTimestamp(timestamp, { enabled: true, maxAgeSeconds: 300 });
      expect(result2.valid).toBe(true);
    });

    it('uses custom max future', () => {
      const timestamp = new Date(Date.now() + 90 * 1000);
      const result = validateTimestamp(timestamp, { enabled: true, maxFutureSeconds: 60 });
      expect(result.valid).toBe(false);

      const result2 = validateTimestamp(timestamp, { enabled: true, maxFutureSeconds: 120 });
      expect(result2.valid).toBe(true);
    });
  });

  describe('createReplayConfig', () => {
    it('creates config with defaults', () => {
      const config = createReplayConfig({});
      expect(config.enabled).toBe(true);
      expect(config.maxAgeSeconds).toBe(300);
      expect(config.maxFutureSeconds).toBe(60);
    });

    it('overrides defaults with provided values', () => {
      const config = createReplayConfig({
        replay_protection_enabled: false,
        max_age_seconds: 600,
        max_future_seconds: 120,
      });
      expect(config.enabled).toBe(false);
      expect(config.maxAgeSeconds).toBe(600);
      expect(config.maxFutureSeconds).toBe(120);
    });
  });
});