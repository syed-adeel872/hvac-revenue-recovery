import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '@/lib/safety/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 100 });
  });

  it('starts in CLOSED state', () => {
    expect(cb.getState().state).toBe('CLOSED');
    expect(cb.canExecute()).toBe(true);
  });

  it('stays CLOSED below failure threshold', () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe('CLOSED');
    expect(cb.canExecute()).toBe(true);
  });

  it('transitions to OPEN after failure threshold', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe('OPEN');
    expect(cb.canExecute()).toBe(false);
  });

  it('blocks execution while OPEN', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.canExecute()).toBe(false);
    expect(cb.canExecute()).toBe(false);
    expect(cb.canExecute()).toBe(false);
  });

  it('transitions to HALF_OPEN after recovery timeout', async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe('OPEN');

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cb.canExecute()).toBe(true);
    expect(cb.getState().state).toBe('HALF_OPEN');
  });

  it('transitions to CLOSED from HALF_OPEN on success', async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    await new Promise((resolve) => setTimeout(resolve, 150));
    cb.canExecute();
    expect(cb.getState().state).toBe('HALF_OPEN');

    cb.recordSuccess();
    expect(cb.getState().state).toBe('CLOSED');
    expect(cb.canExecute()).toBe(true);
  });

  it('transitions to OPEN from HALF_OPEN on failure', async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    await new Promise((resolve) => setTimeout(resolve, 150));
    cb.canExecute();
    expect(cb.getState().state).toBe('HALF_OPEN');

    cb.recordFailure();
    expect(cb.getState().state).toBe('OPEN');
    expect(cb.canExecute()).toBe(false);
  });

  it('resets failure count on success in CLOSED state', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getState().failureCount).toBe(0);
  });

  it('resets all state with reset()', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.reset();
    expect(cb.getState().state).toBe('CLOSED');
    expect(cb.getState().failureCount).toBe(0);
    expect(cb.getState().lastFailureTime).toBeNull();
  });

  it('uses default options when none provided', () => {
    const defaultCb = new CircuitBreaker();
    expect(defaultCb.getState().state).toBe('CLOSED');
    expect(defaultCb.canExecute()).toBe(true);
  });

  it('tracks failure count correctly', () => {
    cb.recordFailure();
    expect(cb.getState().failureCount).toBe(1);
    cb.recordFailure();
    expect(cb.getState().failureCount).toBe(2);
  });

  it('records last failure time', () => {
    const before = Date.now();
    cb.recordFailure();
    const after = Date.now();
    expect(cb.getState().lastFailureTime).toBeGreaterThanOrEqual(before);
    expect(cb.getState().lastFailureTime).toBeLessThanOrEqual(after);
  });
});
