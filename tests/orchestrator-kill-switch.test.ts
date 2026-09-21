import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '@/lib/pipeline/orchestrator';
import { checkKillSwitch } from '@/lib/safety/resilience/kill-switch';

vi.mock('@/lib/safety/resilience/kill-switch', () => ({
  checkKillSwitch: vi.fn(),
  checkGlobalKillSwitch: vi.fn(),
}));

vi.mock('@/lib/webhook/processor', () => ({
  processBatchOnce: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
}));

vi.mock('@/lib/workers/intelligence/engine', () => ({
  processBatch: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
}));

vi.mock('@/lib/workers/recovery/engine', () => ({
  processBatch: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
  processInboundMessages: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
}));

vi.mock('@/lib/workers/execution/engine', () => ({
  processBatch: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0, rejected: 0, held: 0 }),
  resetTenantCircuitBreakers: vi.fn(),
}));

vi.mock('@/lib/workers/operations/engine', () => ({
  processBatch: vi.fn().mockResolvedValue({ total: 0, succeeded: 0, failed: 0 }),
}));

function createMockSupabase() {
  return {} as any;
}

describe('runPipeline with per-tenant kill switch', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  it('blocks pipeline at start when per-tenant kill switch is active', async () => {
    (checkKillSwitch as any).mockResolvedValue({
      enabled: true,
      reason: 'Kill switch is activated for this tenant',
    });

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      skipStages: ['ingestion', 'inbound', 'intelligence', 'recovery', 'execution', 'operations'],
    });

    expect(result.success).toBe(false);
    expect(result.stages[0].stage).toBe('kill_switch');
    expect(result.stages[0].error).toContain('Kill switch');
  });

  it('checks per-tenant kill switch between stages', async () => {
    (checkKillSwitch as any)
      .mockResolvedValueOnce({ enabled: false })
      .mockResolvedValueOnce({ enabled: false })
      .mockResolvedValueOnce({ enabled: true, reason: 'Tenant kill switch activated' });

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      batchSize: 10,
    });

    expect(checkKillSwitch).toHaveBeenCalledWith(mockSupabase, 'client-1');
    expect(result.stages.some((s) => s.error?.includes('Tenant kill switch'))).toBe(true);
  });

  it('allows pipeline when kill switch is inactive', async () => {
    (checkKillSwitch as any).mockResolvedValue({ enabled: false });

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      skipStages: ['ingestion', 'inbound', 'intelligence', 'recovery', 'execution', 'operations'],
    });

    expect(result.success).toBe(true);
    expect(result.stages).toHaveLength(0);
  });
});
