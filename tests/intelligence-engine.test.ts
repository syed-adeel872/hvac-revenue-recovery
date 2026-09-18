import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processEvent,
  processBatch,
} from '@/lib/workers/intelligence/engine';
import { claimEvents, markEventProcessed } from '@/lib/workers/intelligence/claim-events';
import { callLLM } from '@/lib/llm/client';
import {
  determineRiskLevel,
  determineApprovalRequired,
  CONFIDENCE_THRESHOLD,
  ClaimedWorkflowEvent,
} from '@/lib/workers/intelligence/types';

vi.mock('@/lib/llm/client', () => ({
  callLLM: vi.fn(),
}));

vi.mock('@/lib/workers/intelligence/claim-events', () => ({
  claimEvents: vi.fn(),
  markEventProcessed: vi.fn(),
}));

const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'action-1' }, error: null })),
      })),
    })),
  })),
};

const baseEvent: ClaimedWorkflowEvent = {
  id: 'event-1',
  clientId: 'client-1',
  eventType: 'estimate_sent',
  eventSource: 'webhook:servicetitan',
  payload: {
    customer_name: 'John Smith',
    total_amount: 5000,
    status: 'sent',
    sent_at: '2024-01-01T00:00:00Z',
  },
  metadata: {},
  createdAt: '2024-01-01T00:00:00Z',
};

describe('processEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes event successfully with high confidence', async () => {
    (callLLM as any).mockResolvedValue({
      data: {
        opportunityType: 'unbooked_estimate',
        qualificationScore: 75,
        estimatedRevenue: 5000,
        recommendedStrategy: 'standard_followup',
        riskFactors: [],
        confidence: 0.85,
        reasoning: 'Customer has not booked estimate',
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const result = await processEvent({ supabase: mockSupabase, event: baseEvent });

    expect(result.success).toBe(true);
    expect(result.output?.opportunityType).toBe('unbooked_estimate');
    expect(result.output?.confidence).toBe(0.85);
    expect(result.actionId).toBe('action-1');
  });

  it('flags low confidence for human review', async () => {
    (callLLM as any).mockResolvedValue({
      data: {
        opportunityType: 'unbooked_estimate',
        qualificationScore: 30,
        estimatedRevenue: 1000,
        recommendedStrategy: 'standard_followup',
        riskFactors: ['insufficient_data'],
        confidence: 0.50,
        reasoning: 'Limited data available',
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const result = await processEvent({ supabase: mockSupabase, event: baseEvent });

    expect(result.success).toBe(true);
    expect(result.output?.recommendedStrategy).toBe('flag_for_human_review');
  });

  it('flags high revenue for human review', async () => {
    (callLLM as any).mockResolvedValue({
      data: {
        opportunityType: 'unbooked_estimate',
        qualificationScore: 80,
        estimatedRevenue: 15000,
        recommendedStrategy: 'standard_followup',
        riskFactors: [],
        confidence: 0.90,
        reasoning: 'High value estimate',
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const result = await processEvent({ supabase: mockSupabase, event: baseEvent });

    expect(result.success).toBe(true);
    expect(result.output?.recommendedStrategy).toBe('flag_for_human_review');
  });

  it('handles LLM failure gracefully', async () => {
    (callLLM as any).mockRejectedValue(new Error('LLM service unavailable'));

    const result = await processEvent({ supabase: mockSupabase, event: baseEvent });

    expect(result.success).toBe(false);
    expect(result.error).toBe('LLM service unavailable');
  });

  it('marks event as processed on success', async () => {
    (callLLM as any).mockResolvedValue({
      data: {
        opportunityType: 'unbooked_estimate',
        qualificationScore: 75,
        estimatedRevenue: 5000,
        recommendedStrategy: 'standard_followup',
        riskFactors: [],
        confidence: 0.85,
        reasoning: 'Analysis complete',
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    await processEvent({ supabase: mockSupabase, event: baseEvent });

    expect(markEventProcessed).toHaveBeenCalledWith(mockSupabase, 'event-1', 'client-1');
  });

  it('marks event as processed with error on failure', async () => {
    (callLLM as any).mockRejectedValue(new Error('Analysis failed'));

    await processEvent({ supabase: mockSupabase, event: baseEvent });

    expect(markEventProcessed).toHaveBeenCalledWith(
      mockSupabase,
      'event-1',
      'client-1',
      'Analysis failed'
    );
  });
});

describe('processBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when no events', async () => {
    (claimEvents as any).mockResolvedValue([]);

    const result = await processBatch({
      supabase: mockSupabase,
      clientId: 'client-1',
    });

    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('processes multiple events', async () => {
    (claimEvents as any).mockResolvedValue([
      { ...baseEvent, id: 'event-1' },
      { ...baseEvent, id: 'event-2' },
    ]);
    (callLLM as any).mockResolvedValue({
      data: {
        opportunityType: 'unbooked_estimate',
        qualificationScore: 75,
        estimatedRevenue: 5000,
        recommendedStrategy: 'standard_followup',
        riskFactors: [],
        confidence: 0.85,
        reasoning: 'Analysis complete',
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
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
    (claimEvents as any).mockResolvedValue([
      { ...baseEvent, id: 'event-1' },
      { ...baseEvent, id: 'event-2' },
    ]);
    (callLLM as any)
      .mockResolvedValueOnce({
        data: {
          opportunityType: 'unbooked_estimate',
          qualificationScore: 75,
          estimatedRevenue: 5000,
          recommendedStrategy: 'standard_followup',
          riskFactors: [],
          confidence: 0.85,
          reasoning: 'Analysis complete',
        },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })
      .mockRejectedValueOnce(new Error('LLM failed'));

    const result = await processBatch({
      supabase: mockSupabase,
      clientId: 'client-1',
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe('determineRiskLevel', () => {
  it('returns green for high confidence, low value', () => {
    const output = {
      opportunityType: 'unbooked_estimate' as const,
      qualificationScore: 75,
      estimatedRevenue: 5000,
      recommendedStrategy: 'standard_followup' as const,
      riskFactors: [],
      confidence: 0.85,
      reasoning: 'Test',
    };
    expect(determineRiskLevel(output)).toBe('green');
  });

  it('returns yellow for high value', () => {
    const output = {
      opportunityType: 'unbooked_estimate' as const,
      qualificationScore: 75,
      estimatedRevenue: 15000,
      recommendedStrategy: 'flag_for_human_review' as const,
      riskFactors: [],
      confidence: 0.85,
      reasoning: 'Test',
    };
    expect(determineRiskLevel(output)).toBe('yellow');
  });

  it('returns red for low confidence', () => {
    const output = {
      opportunityType: 'unbooked_estimate' as const,
      qualificationScore: 30,
      estimatedRevenue: 1000,
      recommendedStrategy: 'flag_for_human_review' as const,
      riskFactors: [],
      confidence: 0.50,
      reasoning: 'Test',
    };
    expect(determineRiskLevel(output)).toBe('red');
  });
});

describe('determineApprovalRequired', () => {
  it('returns false for high confidence, low value', () => {
    const output = {
      opportunityType: 'unbooked_estimate' as const,
      qualificationScore: 75,
      estimatedRevenue: 5000,
      recommendedStrategy: 'standard_followup' as const,
      riskFactors: [],
      confidence: 0.85,
      reasoning: 'Test',
    };
    expect(determineApprovalRequired(output)).toBe(false);
  });

  it('returns true for low confidence', () => {
    const output = {
      opportunityType: 'unbooked_estimate' as const,
      qualificationScore: 30,
      estimatedRevenue: 1000,
      recommendedStrategy: 'flag_for_human_review' as const,
      riskFactors: [],
      confidence: 0.50,
      reasoning: 'Test',
    };
    expect(determineApprovalRequired(output)).toBe(true);
  });

  it('returns true for high value', () => {
    const output = {
      opportunityType: 'unbooked_estimate' as const,
      qualificationScore: 75,
      estimatedRevenue: 15000,
      recommendedStrategy: 'flag_for_human_review' as const,
      riskFactors: [],
      confidence: 0.85,
      reasoning: 'Test',
    };
    expect(determineApprovalRequired(output)).toBe(true);
  });
});
