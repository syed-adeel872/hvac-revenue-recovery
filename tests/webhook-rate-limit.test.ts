import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkHttpRateLimit, resetAllHttpRateLimits } from '@/lib/safety/resilience/http-rate-limiter';

describe('Webhook Rate Limiting', () => {
  beforeEach(() => {
    resetAllHttpRateLimits();
  });

  describe('Twilio webhook limits', () => {
    it('allows requests under 100/min', () => {
      for (let i = 0; i < 99; i++) {
        const result = checkHttpRateLimit('twilio:1.2.3.4', { windowMs: 60000, maxRequests: 100 });
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after 100 requests/min', () => {
      for (let i = 0; i < 100; i++) {
        checkHttpRateLimit('twilio:1.2.3.4', { windowMs: 60000, maxRequests: 100 });
      }
      const result = checkHttpRateLimit('twilio:1.2.3.4', { windowMs: 60000, maxRequests: 100 });
      expect(result.allowed).toBe(false);
    });
  });

  describe('ServiceTitan webhook limits', () => {
    it('allows requests under 60/min', () => {
      for (let i = 0; i < 59; i++) {
        const result = checkHttpRateLimit('servicetitan:5.6.7.8', { windowMs: 60000, maxRequests: 60 });
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after 60 requests/min', () => {
      for (let i = 0; i < 60; i++) {
        checkHttpRateLimit('servicetitan:5.6.7.8', { windowMs: 60000, maxRequests: 60 });
      }
      const result = checkHttpRateLimit('servicetitan:5.6.7.8', { windowMs: 60000, maxRequests: 60 });
      expect(result.allowed).toBe(false);
    });
  });

  describe('Generic webhook limits', () => {
    it('allows requests under 60/min', () => {
      for (let i = 0; i < 59; i++) {
        const result = checkHttpRateLimit('webhook:9.10.11.12', { windowMs: 60000, maxRequests: 60 });
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after 60 requests/min', () => {
      for (let i = 0; i < 60; i++) {
        checkHttpRateLimit('webhook:9.10.11.12', { windowMs: 60000, maxRequests: 60 });
      }
      const result = checkHttpRateLimit('webhook:9.10.11.12', { windowMs: 60000, maxRequests: 60 });
      expect(result.allowed).toBe(false);
    });
  });

  describe('Job endpoint limits', () => {
    it('allows requests under 10/min for run-pipeline', () => {
      for (let i = 0; i < 9; i++) {
        const result = checkHttpRateLimit('run-pipeline', { windowMs: 60000, maxRequests: 10 });
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after 10 requests/min for run-pipeline', () => {
      for (let i = 0; i < 10; i++) {
        checkHttpRateLimit('run-pipeline', { windowMs: 60000, maxRequests: 10 });
      }
      const result = checkHttpRateLimit('run-pipeline', { windowMs: 60000, maxRequests: 10 });
      expect(result.allowed).toBe(false);
    });

    it('allows requests under 10/min for process-webhooks', () => {
      for (let i = 0; i < 9; i++) {
        const result = checkHttpRateLimit('process-webhooks', { windowMs: 60000, maxRequests: 10 });
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks after 10 requests/min for process-webhooks', () => {
      for (let i = 0; i < 10; i++) {
        checkHttpRateLimit('process-webhooks', { windowMs: 60000, maxRequests: 10 });
      }
      const result = checkHttpRateLimit('process-webhooks', { windowMs: 60000, maxRequests: 10 });
      expect(result.allowed).toBe(false);
    });
  });

  describe('IP-based isolation', () => {
    it('different IPs have independent limits for Twilio', () => {
      for (let i = 0; i < 100; i++) {
        checkHttpRateLimit('twilio:1.1.1.1', { windowMs: 60000, maxRequests: 100 });
      }
      const blockedIp = checkHttpRateLimit('twilio:1.1.1.1', { windowMs: 60000, maxRequests: 100 });
      const allowedOtherIp = checkHttpRateLimit('twilio:2.2.2.2', { windowMs: 60000, maxRequests: 100 });
      expect(blockedIp.allowed).toBe(false);
      expect(allowedOtherIp.allowed).toBe(true);
    });
  });
});
