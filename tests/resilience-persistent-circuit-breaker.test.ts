import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockChain(data: any, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  return chain;
}

function createMockSupabase(initialState: any = null) {
  const mockChain = createMockChain(
    initialState,
    initialState ? null : { code: 'PGRST116', message: 'Row not found' }
  );
  return {
    from: vi.fn(() => mockChain),
    _mockChain: mockChain,
  };
}

async function createPersistentCB(supabase: any, options: any = {}, clientId = 'client-1') {
  const { PersistentCircuitBreaker } = await import('@/lib/safety/resilience/persistent-circuit-breaker');
  return new PersistentCircuitBreaker(supabase, clientId, options);
}

describe('PersistentCircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when no existing row (fail-open)', async () => {
    const supabase = createMockSupabase(null);
    const cb = await createPersistentCB(supabase);
    const canExecute = await cb.canExecute();
    expect(canExecute).toBe(true);
  });

  it('returns true in CLOSED state', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'CLOSED', failure_count: 0,
      last_failure_time: null, updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    const canExecute = await cb.canExecute();
    expect(canExecute).toBe(true);
  });

  it('returns false in OPEN state', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'OPEN', failure_count: 5,
      last_failure_time: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    const canExecute = await cb.canExecute();
    expect(canExecute).toBe(false);
  });

  it('returns true in HALF_OPEN state (probe allowed)', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'HALF_OPEN', failure_count: 5,
      last_failure_time: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    const canExecute = await cb.canExecute();
    expect(canExecute).toBe(true);
  });

  it('transitions OPEN to HALF_OPEN after recovery timeout', async () => {
    const oldTime = new Date(Date.now() - 60000).toISOString();
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'OPEN', failure_count: 5,
      last_failure_time: oldTime, updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase, { recoveryTimeoutMs: 1000 });
    const canExecute = await cb.canExecute();
    expect(canExecute).toBe(true);
    expect(supabase._mockChain.upsert).toHaveBeenCalled();
  });

  it('recordFailure below threshold stays CLOSED', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'CLOSED', failure_count: 2,
      last_failure_time: null, updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase, { failureThreshold: 5 });
    await cb.recordFailure();
    expect(supabase._mockChain.upsert).toHaveBeenCalled();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.state).toBe('CLOSED');
    expect(upsertData.failure_count).toBe(3);
  });

  it('recordFailure at threshold transitions to OPEN', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'CLOSED', failure_count: 4,
      last_failure_time: null, updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase, { failureThreshold: 5 });
    await cb.recordFailure();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.state).toBe('OPEN');
    expect(upsertData.failure_count).toBe(5);
  });

  it('recordFailure from HALF_OPEN transitions to OPEN', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'HALF_OPEN', failure_count: 5,
      last_failure_time: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    await cb.recordFailure();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.state).toBe('OPEN');
  });

  it('recordFailure when no row creates new CLOSED row with count=1', async () => {
    const supabase = createMockSupabase(null);
    const cb = await createPersistentCB(supabase);
    await cb.recordFailure();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.state).toBe('CLOSED');
    expect(upsertData.failure_count).toBe(1);
  });

  it('recordSuccess from HALF_OPEN transitions to CLOSED, resets count', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'HALF_OPEN', failure_count: 5,
      last_failure_time: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    await cb.recordSuccess();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.state).toBe('CLOSED');
    expect(upsertData.failure_count).toBe(0);
    expect(upsertData.last_failure_time).toBeNull();
  });

  it('recordSuccess from CLOSED resets count', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'CLOSED', failure_count: 3,
      last_failure_time: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    await cb.recordSuccess();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.failure_count).toBe(0);
  });

  it('getState returns defaults when no row exists', async () => {
    const supabase = createMockSupabase(null);
    const cb = await createPersistentCB(supabase);
    const state = await cb.getState();
    expect(state.state).toBe('CLOSED');
    expect(state.failureCount).toBe(0);
    expect(state.lastFailureTime).toBeNull();
  });

  it('reset writes CLOSED with 0 failures', async () => {
    const supabase = createMockSupabase({
      id: '1', client_id: 'client-1', state: 'OPEN', failure_count: 10,
      last_failure_time: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const cb = await createPersistentCB(supabase);
    await cb.reset();
    const upsertData = supabase._mockChain.upsert.mock.calls[0][0];
    expect(upsertData.state).toBe('CLOSED');
    expect(upsertData.failure_count).toBe(0);
    expect(upsertData.last_failure_time).toBeNull();
  });

  it('upsertState throws on database error', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    };
    const supabase = { from: vi.fn(() => mockChain) };
    const cb = await createPersistentCB(supabase);
    await expect(cb.recordFailure()).rejects.toThrow('Failed to persist circuit breaker state');
  });

  it('different clientId values produce independent state', async () => {
    const supabase1 = createMockSupabase(null);
    const cb1 = await createPersistentCB(supabase1);
    const cb2 = await createPersistentCB(supabase1, {}, 'client-2');

    await cb1.recordFailure();
    await cb2.recordFailure();

    const upsertCalls = supabase1._mockChain.upsert.mock.calls;
    expect(upsertCalls[0][0].client_id).toBe('client-1');
    expect(upsertCalls[1][0].client_id).toBe('client-2');
  });
});
