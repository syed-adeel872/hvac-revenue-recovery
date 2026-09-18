import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectStuckIngestionEvents,
  detectStuckActions,
  detectExcessiveRetries,
  detectHighErrorRate,
  detectTenantDisabled,
  detectAllAnomalies,
} from '@/lib/workers/operations/anomaly-detector';

function makeDataChain(data: any, error: any = null) {
  const result = { data, error, count: null };
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  chain.then = (resolve: any, reject?: any) => {
    try { resolve(result); } catch (e) { reject?.(e); }
  };
  chain.catch = (fn: any) => Promise.resolve(result).catch(fn);
  return chain;
}

function makeCountChain(count: number) {
  const result = { count, data: null, error: null };
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
  chain.then = (resolve: any, reject?: any) => {
    try { resolve(result); } catch (e) { reject?.(e); }
  };
  chain.catch = (fn: any) => Promise.resolve(result).catch(fn);
  return chain;
}

function createMockSupabase(tables: Record<string, any>) {
  const chains: Record<string, any> = {};

  return {
    from: vi.fn((table: string) => {
      if (!chains[table]) {
        const val = tables[table];
        if (typeof val === 'number') {
          chains[table] = makeCountChain(val);
        } else if (Array.isArray(val)) {
          chains[table] = makeDataChain(val);
        } else if (val && typeof val === 'object' && 'data' in val) {
          chains[table] = makeDataChain(val.data, val.error ?? null);
        } else {
          chains[table] = makeDataChain(val ?? null);
        }
      }
      return chains[table];
    }),
    _chain: (table: string) => chains[table],
  };
}

describe('detectStuckIngestionEvents', () => {
  it('returns empty when no stuck events', async () => {
    const supabase = createMockSupabase({ ingestion_events: [] });
    const result = await detectStuckIngestionEvents(supabase as any, { clientId: 'client-1' });
    expect(result).toEqual([]);
  });

  it('detects stuck events with medium severity', async () => {
    const supabase = createMockSupabase({ ingestion_events: [{ id: 'evt-1' }, { id: 'evt-2' }] });
    const result = await detectStuckIngestionEvents(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('stuck_ingestion_event');
    expect(result[0].severity).toBe('medium');
    expect(result[0].affectedEntityIds).toEqual(['evt-1', 'evt-2']);
  });

  it('detects stuck events with high severity when > 5', async () => {
    const events = Array.from({ length: 6 }, (_, i) => ({ id: `evt-${i}` }));
    const supabase = createMockSupabase({ ingestion_events: events });
    const result = await detectStuckIngestionEvents(supabase as any, { clientId: 'client-1' });
    expect(result[0].severity).toBe('high');
  });

  it('scopes by client_id', async () => {
    const supabase = createMockSupabase({ ingestion_events: [] });
    await detectStuckIngestionEvents(supabase as any, { clientId: 'client-x' });
    const chain = supabase._chain('ingestion_events');
    expect(chain.eq).toHaveBeenCalledWith('client_id', 'client-x');
  });

  it('applies configurable threshold', async () => {
    const supabase = createMockSupabase({ ingestion_events: [] });
    await detectStuckIngestionEvents(supabase as any, {
      clientId: 'client-1',
      stuckThresholdMinutes: 30,
    });
    const chain = supabase._chain('ingestion_events');
    expect(chain.lt).toHaveBeenCalled();
  });

  it('throws on database error', async () => {
    const supabase = {
      from: vi.fn(() => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
        };
        chain.then = (resolve: any) => resolve({ data: null, error: { message: 'db error' } });
        chain.catch = (fn: any) => Promise.resolve({ data: null, error: { message: 'db error' } }).catch(fn);
        return chain;
      }),
    };
    await expect(
      detectStuckIngestionEvents(supabase as any, { clientId: 'client-1' }),
    ).rejects.toThrow('Failed to detect stuck ingestion events');
  });
});

describe('detectStuckActions', () => {
  it('returns empty when no stuck actions', async () => {
    const supabase = createMockSupabase({ actions: [] });
    const result = await detectStuckActions(supabase as any, { clientId: 'client-1' });
    expect(result).toEqual([]);
  });

  it('detects stuck actions', async () => {
    const supabase = createMockSupabase({ actions: [{ id: 'act-1' }] });
    const result = await detectStuckActions(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('stuck_action');
    expect(result[0].affectedEntityIds).toEqual(['act-1']);
  });

  it('scopes by client_id', async () => {
    const supabase = createMockSupabase({ actions: [] });
    await detectStuckActions(supabase as any, { clientId: 'client-y' });
    const chain = supabase._chain('actions');
    expect(chain.eq).toHaveBeenCalledWith('client_id', 'client-y');
  });
});

describe('detectExcessiveRetries', () => {
  it('returns empty when no excessive retries', async () => {
    const supabase = createMockSupabase({ ingestion_events: [], workflow_events: [] });
    const result = await detectExcessiveRetries(supabase as any, { clientId: 'client-1' });
    expect(result).toEqual([]);
  });

  it('detects excessive retries from ingestion_events', async () => {
    const supabase = createMockSupabase({
      ingestion_events: [{ id: 'evt-1' }],
      workflow_events: [],
    });
    const result = await detectExcessiveRetries(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('excessive_retries');
    expect(result[0].affectedEntityIds).toEqual(['evt-1']);
  });

  it('detects excessive retries from workflow_events', async () => {
    const supabase = createMockSupabase({
      ingestion_events: [],
      workflow_events: [{ id: 'we-1' }],
    });
    const result = await detectExcessiveRetries(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].affectedEntityIds).toEqual(['we-1']);
  });

  it('combines retries from both tables', async () => {
    const supabase = createMockSupabase({
      ingestion_events: [{ id: 'evt-1' }, { id: 'evt-2' }],
      workflow_events: [{ id: 'we-1' }],
    });
    const result = await detectExcessiveRetries(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].affectedEntityIds).toEqual(['evt-1', 'evt-2', 'we-1']);
  });

  it('uses configurable threshold', async () => {
    const supabase = createMockSupabase({ ingestion_events: [], workflow_events: [] });
    await detectExcessiveRetries(supabase as any, {
      clientId: 'client-1',
      excessiveRetryThreshold: 5,
    });
    const chain = supabase._chain('ingestion_events');
    expect(chain.gte).toHaveBeenCalledWith('retry_count', 5);
  });
});

describe('detectHighErrorRate', () => {
  it('returns empty when below threshold', async () => {
    const supabase = createMockSupabase({ errors: 5 });
    const result = await detectHighErrorRate(supabase as any, { clientId: 'client-1' });
    expect(result).toEqual([]);
  });

  it('detects high error rate', async () => {
    const supabase = createMockSupabase({ errors: 15 });
    const result = await detectHighErrorRate(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('high_error_rate');
    expect(result[0].severity).toBe('high');
  });

  it('uses critical severity when >= 2x threshold', async () => {
    const supabase = createMockSupabase({ errors: 25 });
    const result = await detectHighErrorRate(supabase as any, { clientId: 'client-1' });
    expect(result[0].severity).toBe('critical');
  });

  it('uses configurable threshold', async () => {
    const supabase = createMockSupabase({ errors: 5 });
    const result = await detectHighErrorRate(supabase as any, {
      clientId: 'client-1',
      highErrorThreshold: 5,
    });
    expect(result).toHaveLength(1);
  });
});

describe('detectTenantDisabled', () => {
  it('returns empty when tenant is active', async () => {
    const supabase = createMockSupabase({
      clients: { data: { id: 'client-1', status: 'active' } },
    });
    const result = await detectTenantDisabled(supabase as any, { clientId: 'client-1' });
    expect(result).toEqual([]);
  });

  it('detects suspended tenant', async () => {
    const supabase = createMockSupabase({
      clients: { data: { id: 'client-1', status: 'suspended' } },
    });
    const result = await detectTenantDisabled(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tenant_disabled');
    expect(result[0].severity).toBe('critical');
    expect(result[0].description).toContain('suspended');
  });

  it('detects archived tenant', async () => {
    const supabase = createMockSupabase({
      clients: { data: { id: 'client-1', status: 'archived' } },
    });
    const result = await detectTenantDisabled(supabase as any, { clientId: 'client-1' });
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('critical');
  });
});

describe('detectAllAnomalies', () => {
  it('combines all anomaly types', async () => {
    const supabase = createMockSupabase({
      clients: { data: { id: 'client-1', status: 'suspended' } },
      ingestion_events: [{ id: 'evt-1' }],
      actions: [{ id: 'act-1' }],
      workflow_events: [],
      errors: 0,
    });
    const result = await detectAllAnomalies(supabase as any, { clientId: 'client-1' });
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.map((a) => a.type)).toContain('tenant_disabled');
    expect(result.map((a) => a.type)).toContain('stuck_ingestion_event');
  });

  it('returns empty when no anomalies', async () => {
    const supabase = createMockSupabase({
      clients: { data: { id: 'client-1', status: 'active' } },
      ingestion_events: [],
      actions: [],
      workflow_events: [],
      errors: 0,
    });
    const result = await detectAllAnomalies(supabase as any, { clientId: 'client-1' });
    expect(result).toEqual([]);
  });
});
