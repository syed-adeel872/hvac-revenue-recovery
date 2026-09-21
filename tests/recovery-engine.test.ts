import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRecovery, processBatch } from '@/lib/workers/recovery/engine';
import { claimIntelligenceActions, getConversationHistory } from '@/lib/workers/recovery/claim-actions';
import { evaluateSafety } from '@/lib/safety/evaluate-safety';
import { ClaimedAction, RecoveryOutput } from '@/lib/workers/recovery/types';
import { IntelligenceOutput } from '@/lib/workers/intelligence/types';
import { validateDraftConstraints } from '@/lib/workers/recovery/draft-response';

vi.mock('@/lib/workers/recovery/claim-actions', () => ({
  claimIntelligenceActions: vi.fn(),
  claimInboundMessages: vi.fn(),
  getConversationHistory: vi.fn(),
}));

vi.mock('@/lib/workers/recovery/draft-response', async () => {
  const actual = await vi.importActual('@/lib/workers/recovery/draft-response');
  return {
    ...actual,
    draftResponse: vi.fn(),
  };
});

vi.mock('@/lib/safety/evaluate-safety', () => ({
  evaluateSafety: vi.fn(),
}));

vi.mock('@/lib/llm/client', () => ({
  callLLM: vi.fn(),
}));

import { draftResponse } from '@/lib/workers/recovery/draft-response';

const baseIntelligenceOutput: IntelligenceOutput = {
  opportunityType: 'unbooked_estimate',
  qualificationScore: 75,
  estimatedRevenue: 5000,
  recommendedStrategy: 'standard_followup',
  riskFactors: [],
  confidence: 0.85,
  reasoning: 'Customer has not booked estimate',
};

const baseAction: ClaimedAction = {
  id: 'action-1',
  clientId: 'client-1',
  customerId: 'customer-1',
  conversationId: undefined,
  estimateId: 'estimate-1',
  leadId: 'lead-1',
  workflowEventId: 'workflow-1',
  actionType: 'revenue_recovery_analysis',
  input: {},
  output: baseIntelligenceOutput,
  riskLevel: 'green',
  status: 'executing',
};

function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };

  return {
    from: vi.fn(() => mockChain),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    _mockChain: mockChain,
  };
}

describe('processRecovery', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockSupabase._mockChain.single.mockResolvedValue({ data: { id: 'recovery-action-1' }, error: null });
    (getConversationHistory as any).mockResolvedValue([]);
  });

  it('processes recovery successfully with Safety ALLOW', async () => {
    (draftResponse as any).mockResolvedValue({
      response: 'Hi! I noticed you received an estimate. Would you like to schedule a time to discuss?',
      tone: 'professional',
      keyPoints: ['estimate follow-up', 'scheduling'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });

    const result = await processRecovery({ supabase: mockSupabase, action: baseAction });

    expect(result.success).toBe(true);
    expect(result.output?.safetyDecision).toBe('ALLOW');
    expect(result.actionId).toBe('recovery-action-1');
  });

  it('rejects action when Safety BLOCK', async () => {
    (draftResponse as any).mockResolvedValue({
      response: 'We would love to help you with your HVAC needs.',
      tone: 'professional',
      keyPoints: ['follow-up'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'BLOCK',
      reason: 'Consent has been revoked',
      rules: ['consent_revoked'],
      evaluatedAt: new Date(),
    });

    const result = await processRecovery({ supabase: mockSupabase, action: baseAction });

    expect(result.success).toBe(true);
    expect(result.output?.safetyDecision).toBe('BLOCK');
    expect(result.error).toContain('Safety BLOCK');
  });

  it('sets approval required when Safety ESCALATE', async () => {
    (draftResponse as any).mockResolvedValue({
      response: 'Thank you for your interest. Let me check availability for you.',
      tone: 'professional',
      keyPoints: ['availability check'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ESCALATE',
      reason: 'Consent status is unknown',
      rules: ['consent_unknown'],
      evaluatedAt: new Date(),
    });

    const result = await processRecovery({ supabase: mockSupabase, action: baseAction });

    expect(result.success).toBe(true);
    expect(result.output?.safetyDecision).toBe('ESCALATE');
  });

  it('handles draft validation failure', async () => {
    (draftResponse as any).mockResolvedValue({
      response: '',
      tone: 'professional',
      keyPoints: [],
    });

    const result = await processRecovery({ supabase: mockSupabase, action: baseAction });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Draft validation failed');
  });

  it('handles draft response error', async () => {
    (draftResponse as any).mockRejectedValue(new Error('LLM service unavailable'));

    const result = await processRecovery({ supabase: mockSupabase, action: baseAction });

    expect(result.success).toBe(false);
    expect(result.error).toBe('LLM service unavailable');
  });

  it('classifies intent from inbound message', async () => {
    const actionWithMessage: ClaimedAction = {
      ...baseAction,
      input: {
        inboundMessage: {
          content: 'I would like to schedule an appointment',
          channel: 'sms',
        },
      },
    };

    (draftResponse as any).mockResolvedValue({
      response: 'Great! Let me find a time that works for you.',
      tone: 'professional',
      keyPoints: ['scheduling'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });

    const result = await processRecovery({ supabase: mockSupabase, action: actionWithMessage });

    expect(result.success).toBe(true);
    expect(result.output?.intent).toBe('interested');
  });

  it('maps strategy to intent when no inbound message', async () => {
    const actionUrgent: ClaimedAction = {
      ...baseAction,
      output: {
        ...baseIntelligenceOutput,
        recommendedStrategy: 'urgent_followup',
      },
    };

    (draftResponse as any).mockResolvedValue({
      response: 'Following up on your estimate. Would you like to proceed?',
      tone: 'urgent',
      keyPoints: ['urgent follow-up'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });

    const result = await processRecovery({ supabase: mockSupabase, action: actionUrgent });

    expect(result.success).toBe(true);
    expect(result.output?.intent).toBe('interested');
  });

  it('enforces tenant isolation', async () => {
    (draftResponse as any).mockResolvedValue({
      response: 'Hello! How can we help?',
      tone: 'professional',
      keyPoints: ['greeting'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });

    await processRecovery({ supabase: mockSupabase, action: baseAction });

    expect(evaluateSafety).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        clientId: 'client-1',
        customerId: 'customer-1',
      })
    );
  });
});

describe('processBatch', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockSupabase._mockChain.single.mockResolvedValue({ data: { id: 'recovery-action-1' }, error: null });
    (getConversationHistory as any).mockResolvedValue([]);
  });

  it('returns empty result when no actions', async () => {
    (claimIntelligenceActions as any).mockResolvedValue([]);

    const result = await processBatch({
      supabase: mockSupabase,
      clientId: 'client-1',
    });

    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('processes multiple actions', async () => {
    (claimIntelligenceActions as any).mockResolvedValue([
      { ...baseAction, id: 'action-1' },
      { ...baseAction, id: 'action-2' },
    ]);
    (draftResponse as any).mockResolvedValue({
      response: 'Hello! Would you like to proceed?',
      tone: 'professional',
      keyPoints: ['follow-up'],
    });
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });

    const result = await processBatch({
      supabase: mockSupabase,
      clientId: 'client-1',
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('handles mix of success and failure', async () => {
    (claimIntelligenceActions as any).mockResolvedValue([
      { ...baseAction, id: 'action-1' },
      { ...baseAction, id: 'action-2' },
    ]);
    (draftResponse as any)
      .mockResolvedValueOnce({
        response: 'Hello! Would you like to proceed?',
        tone: 'professional',
        keyPoints: ['follow-up'],
      })
      .mockRejectedValueOnce(new Error('LLM failed'));
    (evaluateSafety as any).mockResolvedValue({
      decision: 'ALLOW',
      reason: '',
      rules: [],
      evaluatedAt: new Date(),
    });

    const result = await processBatch({
      supabase: mockSupabase,
      clientId: 'client-1',
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe('validateDraftConstraints', () => {
  it('returns valid for good draft', () => {
    const draft = {
      response: 'Hello! Would you like to schedule a time?',
      tone: 'professional' as const,
      keyPoints: ['scheduling'],
    };
    expect(validateDraftConstraints(draft).valid).toBe(true);
  });

  it('returns invalid for empty response', () => {
    const draft = {
      response: '',
      tone: 'professional' as const,
      keyPoints: [],
    };
    const result = validateDraftConstraints(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Response is empty');
  });

  it('returns invalid for response over 320 chars', () => {
    const draft = {
      response: 'a'.repeat(321),
      tone: 'professional' as const,
      keyPoints: [],
    };
    const result = validateDraftConstraints(draft);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('exceeds 320 characters');
  });
});
