import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimRecoveryActions } from '@/lib/workers/execution/claim-actions';

function makeThenableChain(data: any, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  chain.then = (resolve: any, reject?: any) => {
    try {
      resolve({ data, error, count: null });
    } catch (e) {
      reject?.(e);
    }
  };
  chain.catch = (fn: any) => Promise.resolve({ data, error }).catch(fn);
  return chain;
}

function createMockSupabase(options?: { actions?: any[]; updateResult?: any }) {
  const actions = options?.actions ?? [];
  const updateResult = options?.updateResult ?? null;

  let selectCallCount = 0;

  return {
    from: vi.fn((table: string) => {
      if (table === 'actions') {
        selectCallCount++;
        if (selectCallCount === 1) {
          return makeThenableChain(actions);
        }
        return makeThenableChain(updateResult);
      }
      return makeThenableChain(null);
    }),
  };
}

describe('claimRecoveryActions', () => {
  it('returns empty when no actions available', async () => {
    const supabase = createMockSupabase({ actions: [] });
    const result = await claimRecoveryActions(supabase as any, 'client-1');
    expect(result).toEqual([]);
  });

  it('claims available actions', async () => {
    const actions = [
      { id: 'act-1', client_id: 'client-1', status: 'approved' },
      { id: 'act-2', client_id: 'client-1', status: 'approved' },
    ];
    const supabase = createMockSupabase({
      actions,
      updateResult: { id: 'act-1', status: 'executing' },
    });
    const result = await claimRecoveryActions(supabase as any, 'client-1');
    expect(result.length).toBeGreaterThan(0);
  });

  it('scopes by client_id', async () => {
    const supabase = createMockSupabase({ actions: [] });
    await claimRecoveryActions(supabase as any, 'client-xyz');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('client_id', 'client-xyz');
  });

  it('filters by worker_type recovery', async () => {
    const supabase = createMockSupabase({ actions: [] });
    await claimRecoveryActions(supabase as any, 'client-1');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('worker_type', 'recovery');
  });

  it('filters by action_type draft_response', async () => {
    const supabase = createMockSupabase({ actions: [] });
    await claimRecoveryActions(supabase as any, 'client-1');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('action_type', 'draft_response');
  });

  it('filters by status approved', async () => {
    const supabase = createMockSupabase({ actions: [] });
    await claimRecoveryActions(supabase as any, 'client-1');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('status', 'approved');
  });

  it('respects limit parameter', async () => {
    const supabase = createMockSupabase({ actions: [] });
    await claimRecoveryActions(supabase as any, 'client-1', 5);
    const chain = supabase.from.mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it('throws on query error', async () => {
    const supabase = {
      from: vi.fn(() => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
        };
        chain.then = (resolve: any) => resolve({ data: null, error: { message: 'db error' } });
        chain.catch = (fn: any) => Promise.resolve({ data: null, error: { message: 'db error' } }).catch(fn);
        return chain;
      }),
    };
    await expect(
      claimRecoveryActions(supabase as any, 'client-1'),
    ).rejects.toThrow('Failed to query recovery actions');
  });
});
