import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkKillSwitch } from '@/lib/safety/resilience/kill-switch';

function makeChain(data: any, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

function createMockSupabase(clientData: any, clientError: any = null) {
  return {
    from: vi.fn(() => makeChain(clientData, clientError)),
  };
}

describe('checkKillSwitch', () => {
  it('returns disabled when kill_switch_enabled is false', async () => {
    const supabase = createMockSupabase({ kill_switch_enabled: false });
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(false);
  });

  it('returns enabled when kill_switch_enabled is true', async () => {
    const supabase = createMockSupabase({ kill_switch_enabled: true });
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('Kill switch');
  });

  it('returns enabled when client not found', async () => {
    const supabase = createMockSupabase(null);
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('not found');
  });

  it('returns enabled on database error (fail-closed)', async () => {
    const supabase = createMockSupabase(null, { message: 'db error' });
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('Failed');
  });

  it('returns enabled on exception (fail-closed)', async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error('connection lost');
      }),
    };
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('failed');
  });

  it('scopes query by client_id', async () => {
    const supabase = createMockSupabase({ kill_switch_enabled: false });
    await checkKillSwitch(supabase as any, 'client-xyz');
    const chain = supabase.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('id', 'client-xyz');
  });
});
