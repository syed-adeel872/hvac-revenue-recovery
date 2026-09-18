import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkKillSwitch, checkGlobalKillSwitch } from '@/lib/safety/resilience/kill-switch';

function makeChain(data: any, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

function createMockSupabase(tableResponses: Record<string, { data: any; error?: any }>) {
  return {
    from: vi.fn((table: string) => {
      const resp = tableResponses[table] || { data: null, error: { message: 'unknown table' } };
      return makeChain(resp.data, resp.error ?? null);
    }),
  };
}

describe('checkGlobalKillSwitch', () => {
  it('returns disabled when global_kill_switch is not set', async () => {
    const supabase = createMockSupabase({ system_config: { data: null } });
    const result = await checkGlobalKillSwitch(supabase as any);
    expect(result.enabled).toBe(false);
  });

  it('returns enabled when global_kill_switch is true', async () => {
    const supabase = createMockSupabase({ system_config: { data: { value: 'true' } } });
    const result = await checkGlobalKillSwitch(supabase as any);
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('Global');
  });

  it('returns enabled on database error (fail-closed)', async () => {
    const supabase = createMockSupabase({ system_config: { data: null, error: { message: 'db error' } } });
    const result = await checkGlobalKillSwitch(supabase as any);
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('Failed');
  });
});

describe('checkKillSwitch', () => {
  it('returns disabled when kill_switch_enabled is false', async () => {
    const supabase = createMockSupabase({
      system_config: { data: null },
      clients: { data: { kill_switch_enabled: false } },
    });
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(false);
  });

  it('returns enabled when kill_switch_enabled is true', async () => {
    const supabase = createMockSupabase({
      system_config: { data: null },
      clients: { data: { kill_switch_enabled: true } },
    });
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('Kill switch');
  });

  it('returns enabled when client not found', async () => {
    const supabase = createMockSupabase({
      system_config: { data: null },
      clients: { data: null },
    });
    const result = await checkKillSwitch(supabase as any, 'client-1');
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('not found');
  });

  it('returns enabled on database error (fail-closed)', async () => {
    const supabase = createMockSupabase({
      system_config: { data: null },
      clients: { data: null, error: { message: 'db error' } },
    });
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
    const supabase = createMockSupabase({
      system_config: { data: null },
      clients: { data: { kill_switch_enabled: false } },
    });
    await checkKillSwitch(supabase as any, 'client-xyz');
    const clientsChain = supabase.from.mock.calls.find((call: any) => call[0] === 'clients');
    expect(clientsChain).toBeDefined();
  });
});
