import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkHttpRateLimit, resetAllHttpRateLimits } from '@/lib/safety/resilience/http-rate-limiter';

describe('checkHttpRateLimit', () => {
  beforeEach(() => {
    resetAllHttpRateLimits();
  });

  it('allows requests under the limit', () => {
    const result = checkHttpRateLimit('test-key', { windowMs: 60000, maxRequests: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks remaining count correctly', () => {
    checkHttpRateLimit('test-key', { windowMs: 60000, maxRequests: 3 });
    checkHttpRateLimit('test-key', { windowMs: 60000, maxRequests: 3 });
    const result = checkHttpRateLimit('test-key', { windowMs: 60000, maxRequests: 3 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('blocks at limit', () => {
    const config = { windowMs: 60000, maxRequests: 2 };
    checkHttpRateLimit('test-key', config);
    checkHttpRateLimit('test-key', config);
    const result = checkHttpRateLimit('test-key', config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('different keys are independent', () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    checkHttpRateLimit('key-a', config);
    checkHttpRateLimit('key-b', config);
    const resultA = checkHttpRateLimit('key-a', config);
    const resultB = checkHttpRateLimit('key-b', config);
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(false);
  });

  it('resets after window expires', async () => {
    const config = { windowMs: 50, maxRequests: 1 };
    checkHttpRateLimit('test-key', config);
    const blocked = checkHttpRateLimit('test-key', config);
    expect(blocked.allowed).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 60));

    const allowed = checkHttpRateLimit('test-key', config);
    expect(allowed.allowed).toBe(true);
  });

  it('returns retryAfterMs based on remaining window', () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    checkHttpRateLimit('test-key', config);
    const result = checkHttpRateLimit('test-key', config);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
  });
});

describe('resetAllHttpRateLimits', () => {
  it('clears all entries', () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    checkHttpRateLimit('key-a', config);
    checkHttpRateLimit('key-b', config);
    resetAllHttpRateLimits();
    const a = checkHttpRateLimit('key-a', config);
    const b = checkHttpRateLimit('key-b', config);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
