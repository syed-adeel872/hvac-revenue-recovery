import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectMetrics } from '@/lib/workers/operations/metrics';

function createCountMock(defaultCount = 0) {
  const calls: Array<{ table: string; col: string; val: any }> = [];

  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function (this: any, col: string, val: any) {
      calls.push({ table: '__current__', col, val });
      return this;
    }),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ count: defaultCount, error: null })),
    _calls: calls,
  };

  return chain;
}

function makeSupabaseWithCountOverride(
  countFn: (table: string, calls: Array<{ col: string; val: any }>) => number,
) {
  const chains = new Map<string, ReturnType<typeof createCountMock>>();

  return {
    from: vi.fn((table: string) => {
      const chain = createCountMock(0);
      chains.set(table, chain);

      chain.then = vi.fn((resolve: any) => {
        const tableCalls = chain._calls.filter((c) => c.table === '__current__');
        const count = countFn(table, tableCalls);
        resolve({ count, error: null });
      });

      return chain;
    }),
    _chains: chains,
  };
}

describe('collectMetrics', () => {
  it('returns zero metrics when no data exists', async () => {
    const supabase = makeSupabaseWithCountOverride(() => 0);
    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
      periodHours: 24,
    });

    expect(result.clientId).toBe('client-1');
    expect(result.events.total).toBe(0);
    expect(result.actions.total).toBe(0);
    expect(result.errors.total).toBe(0);
    expect(result.errors.unresolved).toBe(0);
  });

  it('scopes all queries by client_id', async () => {
    const supabase = makeSupabaseWithCountOverride(() => 0);
    await collectMetrics(supabase as any, {
      clientId: 'client-abc',
      periodHours: 24,
    });

    for (const chain of supabase._chains.values()) {
      const eqCalls = chain.eq.mock.calls;
      const hasClientId = eqCalls.some(
        (call: any[]) => call[0] === 'client_id' && call[1] === 'client-abc',
      );
      expect(hasClientId).toBe(true);
    }
  });

  it('includes period start and end in result', async () => {
    const supabase = makeSupabaseWithCountOverride(() => 0);
    const before = Date.now();
    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
      periodHours: 24,
    });
    const after = Date.now();

    const startMs = new Date(result.periodStart).getTime();
    const endMs = new Date(result.periodEnd).getTime();
    expect(endMs).toBeGreaterThanOrEqual(before - 1000);
    expect(endMs).toBeLessThanOrEqual(after + 1000);
    expect(endMs).toBeGreaterThan(startMs);
    const periodHoursMs = 24 * 60 * 60 * 1000;
    expect(endMs - startMs).toBeCloseTo(periodHoursMs, -3);
  });

  it('defaults to 24 hour period', async () => {
    const supabase = makeSupabaseWithCountOverride(() => 0);
    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
    });

    const periodMs =
      new Date(result.periodEnd).getTime() - new Date(result.periodStart).getTime();
    expect(periodMs).toBeCloseTo(24 * 60 * 60 * 1000, -3);
  });

  it('supports custom period hours', async () => {
    const supabase = makeSupabaseWithCountOverride(() => 0);
    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
      periodHours: 1,
    });

    const periodMs =
      new Date(result.periodEnd).getTime() - new Date(result.periodStart).getTime();
    expect(periodMs).toBeCloseTo(1 * 60 * 60 * 1000, -3);
  });

  it('populates event metrics from ingestion_events', async () => {
    const eventCounts: Record<string, number> = {
      received: 5,
      processing: 2,
      mapped: 0,
      workflow_created: 0,
      completed: 10,
      failed: 1,
      retryable_failed: 0,
    };

    const supabase = makeSupabaseWithCountOverride((table, calls) => {
      if (table === 'ingestion_events') {
        const statusCall = calls.find((c) => c.col === 'status');
        return statusCall ? (eventCounts[statusCall.val as string] ?? 0) : 0;
      }
      return 0;
    });

    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
      periodHours: 24,
    });

    expect(result.events.received).toBe(5);
    expect(result.events.processing).toBe(2);
    expect(result.events.completed).toBe(10);
    expect(result.events.failed).toBe(1);
  });

  it('populates error metrics including severity breakdown', async () => {
    const errorCounts: Record<string, number> = {
      total: 12,
      unresolved: 8,
      low: 2,
      medium: 3,
      high: 2,
      critical: 1,
    };

    const supabase = makeSupabaseWithCountOverride((table, calls) => {
      if (table !== 'errors') return 0;

      const resolvedFalse = calls.some((c) => c.col === 'resolved' && c.val === false);
      const severity = calls.find((c) => c.col === 'severity');

      if (!resolvedFalse && !severity) return errorCounts['total'];
      if (severity) return errorCounts[severity.val as string] ?? 0;
      return errorCounts['unresolved'];
    });

    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
      periodHours: 24,
    });

    expect(result.errors.unresolved).toBe(8);
    expect(result.errors.bySeverity.low).toBe(2);
    expect(result.errors.bySeverity.medium).toBe(3);
    expect(result.errors.bySeverity.high).toBe(2);
    expect(result.errors.bySeverity.critical).toBe(1);
  });

  it('collects action metrics', async () => {
    const actionCounts: Record<string, number> = {
      pending: 3,
      approved: 5,
      rejected: 1,
      executing: 2,
      completed: 10,
      failed: 1,
      cancelled: 0,
      expired: 0,
    };

    const supabase = makeSupabaseWithCountOverride((table, calls) => {
      if (table !== 'actions') return 0;
      const statusCall = calls.find((c) => c.col === 'status');
      return statusCall ? (actionCounts[statusCall.val as string] ?? 0) : 0;
    });

    const result = await collectMetrics(supabase as any, {
      clientId: 'client-1',
      periodHours: 24,
    });

    expect(result.actions.pending).toBe(3);
    expect(result.actions.approved).toBe(5);
    expect(result.actions.completed).toBe(10);
    expect(result.actions.total).toBe(22);
  });
});
