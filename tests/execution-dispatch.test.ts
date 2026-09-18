import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchMessage } from '@/lib/workers/execution/dispatch';
import { MockMessagingAdapter } from '@/lib/workers/execution/adapters';
import { ClaimedRecoveryAction } from '@/lib/workers/execution/types';

function makeThenableChain(data: any, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
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

function createMockSupabase(options?: { conversation?: any; messageInsert?: any }) {
  const conversation = options?.conversation ?? { customer_id: 'cust-1' };
  const messageInsert = options?.messageInsert ?? { id: 'msg-1' };

  let callCount = 0;
  return {
    from: vi.fn((table: string) => {
      callCount++;
      if (table === 'conversations') {
        return makeThenableChain(conversation);
      }
      if (table === 'messages') {
        return makeThenableChain(messageInsert);
      }
      return makeThenableChain(null);
    }),
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
    output: { response: 'Hello! Would you like to schedule?', tone: 'professional', keyPoints: ['scheduling'] },
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

describe('dispatchMessage', () => {
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MockMessagingAdapter();
  });

  it('dispatches SMS successfully', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction();
    const result = await dispatchMessage(supabase as any, action, adapter);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-1');
    expect(result.externalId).toBeDefined();
  });

  it('records outbound message with status sent', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction();
    await dispatchMessage(supabase as any, action, adapter);
    const messagesCallIndex = supabase.from.mock.calls.findIndex((call: any) => call[0] === 'messages');
    expect(messagesCallIndex).toBeGreaterThanOrEqual(0);
    const msgChain = supabase.from.mock.results[messagesCallIndex].value;
    const insertPayload = msgChain.insert.mock.calls[0][0];
    expect(insertPayload.direction).toBe('outbound');
    expect(insertPayload.status).toBe('sent');
    expect(insertPayload.channel).toBe('sms');
  });

  it('returns error when no response content', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction({ output: null });
    const result = await dispatchMessage(supabase as any, action, adapter);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No response content');
  });

  it('returns error when no conversation ID', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction({ conversationId: null });
    const result = await dispatchMessage(supabase as any, action, adapter);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No conversation ID');
  });

  it('returns error when adapter fails', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction();
    const failingAdapter = new MockMessagingAdapter({ failureRate: 1 });
    const result = await dispatchMessage(supabase as any, action, failingAdapter);
    expect(result.success).toBe(false);
  });

  it('records failed message on adapter failure', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction();
    const failingAdapter = new MockMessagingAdapter({ failureRate: 1 });
    await dispatchMessage(supabase as any, action, failingAdapter);
    const messagesCallIndex = supabase.from.mock.calls.findIndex((call: any) => call[0] === 'messages');
    expect(messagesCallIndex).toBeGreaterThanOrEqual(0);
    const msgChain = supabase.from.mock.results[messagesCallIndex].value;
    const insertPayload = msgChain.insert.mock.calls[0][0];
    expect(insertPayload.status).toBe('failed');
    expect(insertPayload.direction).toBe('outbound');
  });

  it('scopes conversation query by client_id', async () => {
    const supabase = createMockSupabase();
    const action = createMockAction({ clientId: 'client-abc' });
    await dispatchMessage(supabase as any, action, adapter);
    const convChain = supabase.from.mock.results.find((r: any) => r.value?.eq?.mock)?.value;
    if (convChain?.eq) {
      const eqCalls = convChain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['client_id', 'client-abc']);
    }
  });
});
