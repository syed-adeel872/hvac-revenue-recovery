import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline, runMultiTenantPipeline } from '@/lib/pipeline/orchestrator';
import { MockMessagingAdapter } from '@/lib/workers/execution/adapters';

vi.mock('@/lib/webhook/processor', () => ({
  processBatchOnce: vi.fn(),
}));

vi.mock('@/lib/workers/intelligence/engine', () => ({
  processBatch: vi.fn(),
}));

vi.mock('@/lib/workers/recovery/engine', () => ({
  processBatch: vi.fn(),
}));

vi.mock('@/lib/workers/execution/engine', () => ({
  processBatch: vi.fn(),
  resetTenantCircuitBreakers: vi.fn(),
}));

vi.mock('@/lib/workers/operations/engine', () => ({
  processBatch: vi.fn(),
}));

vi.mock('@/lib/safety/resilience/kill-switch', () => ({
  checkKillSwitch: vi.fn(),
  checkGlobalKillSwitch: vi.fn().mockResolvedValue({ enabled: false }),
}));

import { processBatchOnce } from '@/lib/webhook/processor';
import { processBatch as processIntelligenceBatch } from '@/lib/workers/intelligence/engine';
import { processBatch as processRecoveryBatch } from '@/lib/workers/recovery/engine';
import { processBatch as processExecutionBatch } from '@/lib/workers/execution/engine';
import { processBatch as processOperationsBatch } from '@/lib/workers/operations/engine';
import { checkKillSwitch, checkGlobalKillSwitch } from '@/lib/safety/resilience/kill-switch';

function createMockSupabase() {
  return {} as any;
}

describe('runPipeline', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adapter = new MockMessagingAdapter();

    (checkKillSwitch as any).mockResolvedValue({ enabled: false });
    (checkGlobalKillSwitch as any).mockResolvedValue({ enabled: false });
    (processBatchOnce as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, retried: 0 });
    (processIntelligenceBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
    (processRecoveryBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
    (processExecutionBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, rejected: 0, held: 0, results: [] });
    (processOperationsBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
  });

  it('runs full pipeline successfully across all stages', async () => {
    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
    });

    expect(result.success).toBe(true);
    expect(result.clientId).toBe('client-1');
    expect(result.stages).toHaveLength(5);
    expect(result.stages.map((s) => s.stage)).toEqual([
      'ingestion', 'intelligence', 'recovery', 'execution', 'operations',
    ]);
    expect(result.stages.every((s) => s.success)).toBe(true);
    expect(processBatchOnce).toHaveBeenCalledWith(expect.objectContaining({ supabase: mockSupabase }));
    expect(processIntelligenceBatch).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1' }));
    expect(processRecoveryBatch).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1' }));
    expect(processExecutionBatch).toHaveBeenCalledWith(mockSupabase, 'client-1', adapter, expect.any(Object));
    expect(processOperationsBatch).toHaveBeenCalledWith(mockSupabase, ['client-1']);
  });

  it('blocks pipeline when kill switch is enabled', async () => {
    (checkKillSwitch as any).mockResolvedValue({ enabled: true, reason: 'Emergency stop' });

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
    });

    expect(result.success).toBe(false);
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].stage).toBe('kill_switch');
    expect(result.stages[0].error).toContain('Emergency stop');
    expect(processBatchOnce).not.toHaveBeenCalled();
    expect(processIntelligenceBatch).not.toHaveBeenCalled();
  });

  it('continues remaining stages after ingestion failure', async () => {
    (processBatchOnce as any).mockRejectedValue(new Error('Ingestion crashed'));

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
    });

    expect(result.success).toBe(false);
    const ingestionStage = result.stages.find((s) => s.stage === 'ingestion');
    expect(ingestionStage?.success).toBe(false);
    expect(ingestionStage?.error).toContain('Ingestion crashed');
    expect(processIntelligenceBatch).toHaveBeenCalled();
    expect(processRecoveryBatch).toHaveBeenCalled();
    expect(processExecutionBatch).toHaveBeenCalled();
    expect(processOperationsBatch).toHaveBeenCalled();
  });

  it('continues remaining stages after intelligence failure', async () => {
    (processIntelligenceBatch as any).mockRejectedValue(new Error('LLM unavailable'));

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
    });

    expect(result.success).toBe(false);
    const intelStage = result.stages.find((s) => s.stage === 'intelligence');
    expect(intelStage?.success).toBe(false);
    expect(processRecoveryBatch).toHaveBeenCalled();
    expect(processExecutionBatch).toHaveBeenCalled();
  });

  it('skips specified stages', async () => {
    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
      skipStages: ['ingestion', 'intelligence'],
    });

    expect(result.stages.map((s) => s.stage)).not.toContain('ingestion');
    expect(result.stages.map((s) => s.stage)).not.toContain('intelligence');
    expect(processBatchOnce).not.toHaveBeenCalled();
    expect(processIntelligenceBatch).not.toHaveBeenCalled();
    expect(processRecoveryBatch).toHaveBeenCalled();
  });

  it('reports partial success when some stages have failures', async () => {
    (processExecutionBatch as any).mockResolvedValue({
      total: 3, succeeded: 2, failed: 1, rejected: 0, held: 0, results: [],
    });

    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
    });

    expect(result.success).toBe(false);
    const execStage = result.stages.find((s) => s.stage === 'execution');
    expect(execStage?.failed).toBe(1);
    expect(execStage?.succeeded).toBe(2);
  });

  it('records startedAt and completedAt timestamps', async () => {
    const before = Date.now();
    const result = await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
    });
    const after = Date.now();

    expect(new Date(result.startedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(result.completedAt).getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it('passes batchSize to worker batch functions', async () => {
    await runPipeline({
      supabase: mockSupabase,
      clientId: 'client-1',
      adapter,
      batchSize: 25,
    });

    expect(processIntelligenceBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 25 }),
    );
    expect(processRecoveryBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 25 }),
    );
    expect(processExecutionBatch).toHaveBeenCalledWith(
      mockSupabase, 'client-1', adapter, expect.objectContaining({ batchSize: 25 }),
    );
  });
});

describe('runMultiTenantPipeline', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adapter = new MockMessagingAdapter();

    (checkKillSwitch as any).mockResolvedValue({ enabled: false });
    (checkGlobalKillSwitch as any).mockResolvedValue({ enabled: false });
    (processBatchOnce as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, retried: 0 });
    (processIntelligenceBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
    (processRecoveryBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
    (processExecutionBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, rejected: 0, held: 0, results: [] });
    (processOperationsBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
  });

  it('processes multiple tenants sequentially', async () => {
    const results = await runMultiTenantPipeline({
      supabase: mockSupabase,
      clientIds: ['client-a', 'client-b'],
      adapter,
    });

    expect(results).toHaveLength(2);
    expect(results[0].clientId).toBe('client-a');
    expect(results[1].clientId).toBe('client-b');
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('isolates tenants: client-a failure does not block client-b', async () => {
    let callCount = 0;
    (processIntelligenceBatch as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Client A intelligence failed'));
      }
      return Promise.resolve({ total: 1, succeeded: 1, failed: 0, results: [] });
    });

    const results = await runMultiTenantPipeline({
      supabase: mockSupabase,
      clientIds: ['client-a', 'client-b'],
      adapter,
    });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });

  it('provides per-tenant stage results', async () => {
    const results = await runMultiTenantPipeline({
      supabase: mockSupabase,
      clientIds: ['client-a'],
      adapter,
    });

    expect(results[0].stages).toHaveLength(5);
    expect(results[0].stages.every((s) => s.stage !== undefined)).toBe(true);
  });
});

describe('multi-tenant isolation verification', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adapter = new MockMessagingAdapter();

    (checkKillSwitch as any).mockResolvedValue({ enabled: false });
    (checkGlobalKillSwitch as any).mockResolvedValue({ enabled: false });
    (processBatchOnce as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, retried: 0 });
    (processIntelligenceBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
    (processRecoveryBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
    (processExecutionBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, rejected: 0, held: 0, results: [] });
    (processOperationsBatch as any).mockResolvedValue({ total: 1, succeeded: 1, failed: 0, results: [] });
  });

  it('each tenant gets its own pipeline run with correct clientId', async () => {
    await runMultiTenantPipeline({
      supabase: mockSupabase,
      clientIds: ['tenant-x', 'tenant-y', 'tenant-z'],
      adapter,
    });

    const intelligenceCalls = (processIntelligenceBatch as any).mock.calls;
    const clientIds = intelligenceCalls.map((call: any) => call[0].clientId);
    expect(clientIds).toContain('tenant-x');
    expect(clientIds).toContain('tenant-y');
    expect(clientIds).toContain('tenant-z');
  });

  it('kill switch on one tenant does not affect others', async () => {
    let callCount = 0;
    (checkKillSwitch as any).mockImplementation((_supabase: any, clientId: string) => {
      if (clientId === 'blocked-tenant') {
        return Promise.resolve({ enabled: true, reason: 'Blocked' });
      }
      return Promise.resolve({ enabled: false });
    });

    const results = await runMultiTenantPipeline({
      supabase: mockSupabase,
      clientIds: ['blocked-tenant', 'active-tenant'],
      adapter,
    });

    expect(results[0].success).toBe(false);
    expect(results[0].stages[0].stage).toBe('kill_switch');
    expect(results[1].success).toBe(true);
  });
});
