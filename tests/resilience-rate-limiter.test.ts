import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '@/lib/safety/resilience/rate-limiter';

function makeCountChain(count: number, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
  };
  chain.then = (resolve: any, reject?: any) => {
    try {
      resolve({ count, error });
    } catch (e) {
      reject?.(e);
    }
  };
  chain.catch = (fn: any) => Promise.resolve({ count, error }).catch(fn);
  return chain;
}

function createMockSupabase(hourlyCount: number, dailyCount: number) {
  let callCount = 0;
  return {
    from: vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return makeCountChain(hourlyCount);
      }
      return makeCountChain(dailyCount);
    }),
  };
}

describe('checkRateLimit', () => {
  it('allows when under hourly limit', async () => {
    const supabase = createMockSupabase(2, 5);
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'sms');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
  });

  it('blocks when hourly limit exceeded', async () => {
    const supabase = createMockSupabase(5, 10);
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'sms');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Hourly rate limit');
    expect(result.window).toBe('hourly');
  });

  it('blocks when daily limit exceeded', async () => {
    const supabase = createMockSupabase(3, 20);
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'sms');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily rate limit');
    expect(result.window).toBe('daily');
  });

  it('uses custom limits', async () => {
    const supabase = createMockSupabase(10, 20);
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'email', {
      hourly: 15,
      daily: 50,
    });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(15);
  });

  it('blocks when custom hourly limit exceeded', async () => {
    const supabase = createMockSupabase(15, 20);
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'email', {
      hourly: 15,
      daily: 50,
    });
    expect(result.allowed).toBe(false);
    expect(result.window).toBe('hourly');
  });

  it('scopes by client_id, customer_id, and channel', async () => {
    const supabase = createMockSupabase(0, 0);
    await checkRateLimit(supabase as any, 'client-abc', 'cust-xyz', 'sms');
    const chain = supabase.from.mock.results[0].value;
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls).toContainEqual(['client_id', 'client-abc']);
    expect(eqCalls).toContainEqual(['customer_id', 'cust-xyz']);
    expect(eqCalls).toContainEqual(['channel', 'sms']);
  });

  it('only counts outbound messages', async () => {
    const supabase = createMockSupabase(0, 0);
    await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'sms');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('direction', 'outbound');
  });

  it('blocks on database error (fail-closed)', async () => {
    const supabase = {
      from: vi.fn(() => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
        };
        chain.then = (resolve: any) => resolve({ count: null, error: { message: 'db error' } });
        chain.catch = (fn: any) => Promise.resolve({ count: null, error: { message: 'db error' } }).catch(fn);
        return chain;
      }),
    };
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'sms');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Failed');
  });

  it('blocks on exception (fail-closed)', async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error('connection lost');
      }),
    };
    const result = await checkRateLimit(supabase as any, 'client-1', 'cust-1', 'sms');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('failed');
  });
});
