import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOperations, processBatch } from '@/lib/workers/operations/engine';

function makeThenableChain(resolveData: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn(),
    single: vi.fn(),
  };

  chain.insert.mockResolvedValue(resolveData);
  chain.single.mockResolvedValue(resolveData);
  chain.then = (resolve: any, reject?: any) => {
    try { resolve(resolveData); } catch (e) { reject?.(e); }
  };
  chain.catch = (reject: any) => Promise.resolve(resolveData).catch(reject);

  return chain;
}

function createMockSupabase(options?: { auditError?: string }) {
  const chains: Record<string, any> = {};

  function getChain(table: string) {
    if (chains[table]) return chains[table];

    if (table === 'audit_logs') {
      chains[table] = makeThenableChain(
        options?.auditError
          ? { data: null, error: { message: options.auditError } }
          : { data: { id: 'audit-1' }, error: null },
      );
      chains[table].insert = vi.fn().mockResolvedValue(
        options?.auditError
          ? { data: null, error: { message: options.auditError } }
          : { data: { id: 'audit-1' }, error: null },
      );
    } else if (table === 'clients') {
      chains[table] = makeThenableChain({ count: 0, data: null, error: null });
      chains[table].single.mockResolvedValue({ data: { id: 'client-1', status: 'active' }, error: null });
    } else if (table === 'errors') {
      chains[table] = makeThenableChain({ count: 0, data: null, error: null });
    } else {
      chains[table] = makeThenableChain({ count: 0, data: null, error: null });
    }

    return chains[table];
  }

  return {
    from: vi.fn((table: string) => getChain(table)),
    _chain: (table: string) => getChain(table),
  };
}

describe('runOperations', () => {
  it('returns metrics and anomalies for a client', async () => {
    const supabase = createMockSupabase();
    const result = await runOperations(supabase as any, { clientId: 'client-1' });

    expect(result.clientId).toBe('client-1');
    expect(result.metrics).toBeDefined();
    expect(result.anomalies).toBeDefined();
    expect(result.executedAt).toBeDefined();
  });

  it('writes an audit_logs entry', async () => {
    const supabase = createMockSupabase();
    await runOperations(supabase as any, { clientId: 'client-1' });

    const auditChain = supabase._chain('audit_logs');
    expect(auditChain.insert).toHaveBeenCalledTimes(1);

    const insertPayload = auditChain.insert.mock.calls[0][0];
    expect(insertPayload.client_id).toBe('client-1');
    expect(insertPayload.actor_type).toBe('worker');
    expect(insertPayload.action).toBe('operations_check');
    expect(insertPayload.resource_type).toBe('system');
    expect(insertPayload.resource_id).toBe('client-1');
  });

  it('includes metrics summary in audit metadata', async () => {
    const supabase = createMockSupabase();
    await runOperations(supabase as any, { clientId: 'client-1' });

    const auditChain = supabase._chain('audit_logs');
    const metadata = auditChain.insert.mock.calls[0][0].metadata;
    expect(metadata.metricsSummary).toBeDefined();
    expect(typeof metadata.metricsSummary.eventsTotal).toBe('number');
    expect(typeof metadata.metricsSummary.actionsTotal).toBe('number');
    expect(typeof metadata.metricsSummary.errorsUnresolved).toBe('number');
    expect(Array.isArray(metadata.anomalyTypes)).toBe(true);
  });

  it('throws when audit log insert fails', async () => {
    const supabase = createMockSupabase({ auditError: 'insert denied' });

    await expect(
      runOperations(supabase as any, { clientId: 'client-1' }),
    ).rejects.toThrow('Failed to write audit log');
  });

  it('includes anomaly count in metadata', async () => {
    const supabase = createMockSupabase();
    const result = await runOperations(supabase as any, { clientId: 'client-1' });

    const auditChain = supabase._chain('audit_logs');
    const metadata = auditChain.insert.mock.calls[0][0].metadata;
    expect(typeof metadata.anomaliesDetected).toBe('number');
    expect(typeof metadata.anomalyTypes).toBe('object');
  });

  it('passes configurable threshold options', async () => {
    const supabase = createMockSupabase();
    const result = await runOperations(supabase as any, {
      clientId: 'client-1',
      stuckThresholdMinutes: 30,
      highErrorThreshold: 20,
      excessiveRetryThreshold: 5,
    });
    expect(result).toBeDefined();
  });
});

describe('processBatch', () => {
  it('returns empty result for empty client list', async () => {
    const supabase = createMockSupabase();
    const result = await processBatch(supabase as any, []);
    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('processes multiple clients', async () => {
    const supabase = createMockSupabase();
    const result = await processBatch(supabase as any, ['client-1', 'client-2']);

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);
  });

  it('counts failures without stopping', async () => {
    const supabase = createMockSupabase({ auditError: 'denied' });
    const result = await processBatch(supabase as any, ['client-1', 'client-2']);
    expect(result.failed).toBe(2);
    expect(result.succeeded).toBe(0);
  });

  it('returns results only for succeeded clients', async () => {
    const supabase = createMockSupabase({ auditError: 'fail' });
    const result = await processBatch(supabase as any, ['client-1']);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].anomalies).toHaveLength(1);
    expect(result.results[0].anomalies[0].type).toBe('operations_failure');
    expect(result.failed).toBe(1);
  });

  it('maintains tenant isolation across clients', async () => {
    const supabase = createMockSupabase();
    await processBatch(supabase as any, ['client-a', 'client-b']);

    const auditChain = supabase._chain('audit_logs');
    const inserts = auditChain.insert.mock.calls;
    expect(inserts).toHaveLength(2);
    expect(inserts[0][0].client_id).toBe('client-a');
    expect(inserts[1][0].client_id).toBe('client-b');
  });
});
