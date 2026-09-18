import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRecoveryAction, processBatch, markActionCompleted, markActionFailed, markActionRejected } from '@/lib/workers/execution/engine';
import { MockMessagingAdapter } from '@/lib/workers/execution/adapters';
import { ClaimedRecoveryAction } from '@/lib/workers/execution/types';
import { checkKillSwitch } from '@/lib/safety/resilience/kill-switch';
import { checkRateLimit } from '@/lib/safety/resilience/rate-limiter';
import { evaluateSafety } from '@/lib/safety/evaluate-safety';

vi.mock('@/lib/safety/resilience/kill-switch', () => ({
  checkKillSwitch: vi.fn(),
}));

vi.mock('@/lib/safety/resilience/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/safety/evaluate-safety', () => ({
  evaluateSafety: vi.fn(),
}));

vi.mock('@/lib/safety/resilience/persistent-circuit-breaker', () => {
  return {
    PersistentCircuitBreaker: class MockPersistentCircuitBreaker {
      canExecute = vi.fn().mockResolvedValue(true);
      recordSuccess = vi.fn().mockResolvedValue(undefined);
      recordFailure = vi.fn().mockResolvedValue(undefined);
      getState = vi.fn().mockResolvedValue({ state: 'CLOSED', failureCount: 0, lastFailureTime: null });
      reset = vi.fn().mockResolvedValue(undefined);
    },
  };
});

vi.mock('@/lib/workers/execution/claim-actions', () => ({
  claimRecoveryActions: vi.fn(),
}));

vi.mock('@/lib/workers/execution/dispatch', () => ({
  dispatchMessage: vi.fn(),
}));

import { claimRecoveryActions } from '@/lib/workers/execution/claim-actions';
import { dispatchMessage } from '@/lib/workers/execution/dispatch';

function makeChain(data: any, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

function createMockSupabase() {
  return {
    from: vi.fn((table: string) => makeChain({ id: 'action-1' })),
  };
}

function createMockAction(overrides: Partial<ClaimedRecoveryAction> = {}): ClaimedRecoveryAction {
  return {
    id: 'action-1',
    clientId: 'client-1',
    customerId: 'cust-1',
    leadId: null,
    estimateId: null,
    conversationId: 'conv-1',
    bookingId: null,
    workflowEventId: null,
    workerType: 'recovery',
    actionType: 'draft_response',
    riskLevel: 'green',
    status: 'executing',
    input: { channel: 'sms', customerPhone: '+1234567890' },
    output: { response: 'Hello!', tone: 'professional', keyPoints: [] },
    approvalRequired: false,
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorMessage: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idempotencyKey: null,
    ...overrides,
  };
}

describe('processRecoveryAction', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adapter = new MockMessagingAdapter();

    (checkKillSwitch as any).mockResolvedValue({ enabled: false });
    (checkRateLimit as any).mockResolvedValue({ allowed: true, current: 0, limit: 5, window: 'hourly' });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });
    (dispatchMessage as any).mockResolvedValue({
      success: true,
      messageId: 'msg-1',
      externalId: 'mock-sms-1',
    });
  });

  it('completes successfully through full pipeline', async () => {
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.status).toBe('completed');
    expect(result.messageId).toBe('msg-1');
  });

  it('fails when kill switch is enabled', async () => {
    (checkKillSwitch as any).mockResolvedValue({ enabled: true, reason: 'Kill switch on' });
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Kill switch');
  });

  it('rejects when safety returns BLOCK', async () => {
    (evaluateSafety as any).mockResolvedValue({
      decision: 'BLOCK',
      reason: 'Consent revoked',
      rules: ['consent_revoked'],
      evaluatedAt: new Date(),
    });
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.status).toBe('rejected');
    expect(result.error).toContain('Consent revoked');
  });

  it('fails when safety returns ESCALATE', async () => {
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ESCALATE',
      reason: 'Unknown consent',
      rules: ['consent_unknown'],
      evaluatedAt: new Date(),
    });
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('escalation');
  });

  it('fails when rate limit exceeded', async () => {
    (checkRateLimit as any).mockResolvedValue({
      allowed: false,
      reason: 'Rate limit exceeded: 5/5',
      current: 5,
      limit: 5,
      window: 'hourly',
    });
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Rate limit');
  });

  it('skips rate limit when option set', async () => {
    (checkRateLimit as any).mockResolvedValue({ allowed: false });
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter, {
      skipRateLimit: true,
    });
    expect(result.rateLimit).toBeUndefined();
  });

  it('fails when dispatch fails', async () => {
    (dispatchMessage as any).mockResolvedValue({
      success: false,
      error: 'Provider error',
    });
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Provider error');
  });

  it('includes safety result in output', async () => {
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.safetyResult).toBeDefined();
    expect(result.safetyResult?.decision).toBe('ALLOW');
  });

  it('includes kill switch result in output when disabled', async () => {
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.killSwitch).toBeDefined();
    expect(result.killSwitch?.enabled).toBe(false);
  });

  it('includes rate limit result in output', async () => {
    const result = await processRecoveryAction(mockSupabase as any, createMockAction(), adapter);
    expect(result.rateLimit).toBeDefined();
    expect(result.rateLimit?.allowed).toBe(true);
  });
});

describe('processBatch', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    adapter = new MockMessagingAdapter();

    (checkKillSwitch as any).mockResolvedValue({ enabled: false });
    (checkRateLimit as any).mockResolvedValue({ allowed: true, current: 0, limit: 5, window: 'hourly' });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });
    (dispatchMessage as any).mockResolvedValue({
      success: true,
      messageId: 'msg-1',
      externalId: 'mock-1',
    });
  });

  it('returns empty result when no actions', async () => {
    (claimRecoveryActions as any).mockResolvedValue([]);
    const result = await processBatch(mockSupabase as any, 'client-1', adapter);
    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
  });

  it('processes multiple actions', async () => {
    (claimRecoveryActions as any).mockResolvedValue([
      createMockAction({ id: 'act-1' }),
      createMockAction({ id: 'act-2' }),
    ]);
    const result = await processBatch(mockSupabase as any, 'client-1', adapter);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
  });

  it('counts failures separately', async () => {
    (claimRecoveryActions as any).mockResolvedValue([
      createMockAction({ id: 'act-1' }),
      createMockAction({ id: 'act-2' }),
    ]);
    (dispatchMessage as any)
      .mockResolvedValueOnce({ success: true, messageId: 'msg-1' })
      .mockResolvedValueOnce({ success: false, error: 'fail' });
    const result = await processBatch(mockSupabase as any, 'client-1', adapter);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('counts rejections separately', async () => {
    (claimRecoveryActions as any).mockResolvedValue([createMockAction()]);
    (evaluateSafety as any).mockResolvedValue({
      decision: 'BLOCK',
      reason: 'revoked',
      rules: [],
      evaluatedAt: new Date(),
    });
    const result = await processBatch(mockSupabase as any, 'client-1', adapter);
    expect(result.rejected).toBe(1);
  });

  it('respects batch size', async () => {
    (claimRecoveryActions as any).mockResolvedValue([]);
    await processBatch(mockSupabase as any, 'client-1', adapter, { batchSize: 5 });
    expect(claimRecoveryActions).toHaveBeenCalledWith(mockSupabase, 'client-1', 5);
  });
});

describe('markActionCompleted', () => {
  it('updates action status to completed', async () => {
    const mockSupabase = createMockSupabase();
    await markActionCompleted(mockSupabase as any, 'action-1', 'client-1');
    expect(mockSupabase.from).toHaveBeenCalledWith('actions');
  });
});

describe('markActionFailed', () => {
  it('updates action status to failed with error message', async () => {
    const mockSupabase = createMockSupabase();
    await markActionFailed(mockSupabase as any, 'action-1', 'client-1', 'test error');
    expect(mockSupabase.from).toHaveBeenCalledWith('actions');
  });
});

describe('markActionRejected', () => {
  it('updates action status to rejected with reason', async () => {
    const mockSupabase = createMockSupabase();
    await markActionRejected(mockSupabase as any, 'action-1', 'client-1', 'consent revoked');
    expect(mockSupabase.from).toHaveBeenCalledWith('actions');
  });
});
