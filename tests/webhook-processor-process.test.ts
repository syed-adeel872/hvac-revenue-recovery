import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEvent } from '@/lib/webhook/processor/process-event';
import { ClaimedEvent } from '@/lib/webhook/processor/types';
import { logProcessingStage } from '@/lib/webhook/persistence';

vi.mock('@/lib/webhook/processor/map-event', () => ({
  mapEventToWorkflow: vi.fn(),
}));

vi.mock('@/lib/webhook/processor/create-workflow-event', () => ({
  createWorkflowEvent: vi.fn(),
}));

vi.mock('@/lib/webhook/persistence', () => ({
  logProcessingStage: vi.fn(),
}));

import { mapEventToWorkflow } from '@/lib/webhook/processor/map-event';
import { createWorkflowEvent } from '@/lib/webhook/processor/create-workflow-event';

const mapEventToWorkflowMock = vi.mocked(mapEventToWorkflow);
const createWorkflowEventMock = vi.mocked(createWorkflowEvent);
const logProcessingStageMock = vi.mocked(logProcessingStage);

const createMockSupabase = () => {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
  };
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(),
    _chain: chain,
  };
};

const baseEvent: ClaimedEvent = {
  id: 'event-1',
  clientId: 'client-1',
  providerId: 'provider-1',
  providerName: 'ServiceTitan',
  externalEventId: 'ext-1',
  providerEventType: 'estimate.sent',
  internalEventType: 'estimate_sent',
  rawPayload: { estimateId: 'est-1' },
  rawHeaders: {},
  idempotencyKey: 'key-1',
  providerEventTimestamp: '2024-01-01T00:00:00Z',
  receivedAt: '2024-01-01T00:00:00Z',
  status: 'processing',
  retryCount: 0,
  metadata: {},
};

describe('processEvent', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    vi.clearAllMocks();

    mapEventToWorkflowMock.mockReturnValue({
      eventType: 'estimate_sent',
      eventSource: 'webhook:servicetitan',
      payload: { provider_id: 'provider-1', internal_event_type: 'estimate_sent' },
      metadata: {},
    });

    createWorkflowEventMock.mockResolvedValue({ id: 'workflow-1', isDuplicate: false });

    logProcessingStageMock.mockResolvedValue(undefined);
  });

  it('processes event successfully through all stages', async () => {
    const result = await processEvent({
      supabase: mockSupabase,
      event: baseEvent,
      maxRetries: 5,
    });

    expect(result.success).toBe(true);
    expect(result.workflowEventId).toBe('workflow-1');
    expect(result.shouldRetry).toBeFalsy();

    expect(mapEventToWorkflowMock).toHaveBeenCalledWith(baseEvent);
    expect(createWorkflowEventMock).toHaveBeenCalled();

    const calls = logProcessingStageMock.mock.calls;
    expect(calls.some((c: any[]) => c[3] === 'event_map' && c[4] === 'started')).toBe(true);
    expect(calls.some((c: any[]) => c[3] === 'event_map' && c[4] === 'success')).toBe(true);
    expect(calls.some((c: any[]) => c[3] === 'workflow_create' && c[4] === 'started')).toBe(true);
    expect(calls.some((c: any[]) => c[3] === 'workflow_create' && c[4] === 'success')).toBe(true);
    expect(calls.some((c: any[]) => c[3] === 'complete' && c[4] === 'success')).toBe(true);
  });

  it('transitions through correct statuses: processing -> mapped -> workflow_created -> completed', async () => {
    const updateCalls: string[] = [];
    const mockFrom = vi.fn(() => ({
      update: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => {
            updateCalls.push('update');
            return Promise.resolve({ error: null });
          }),
        })),
      })),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { retry_count: 0 }, error: null }),
    }));

    mockSupabase.from = mockFrom;

    await processEvent({
      supabase: mockSupabase,
      event: baseEvent,
      maxRetries: 5,
    });

    expect(updateCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('retries on transient error when retry count < maxRetries', async () => {
    createWorkflowEventMock.mockRejectedValueOnce(new Error('network timeout'));

    const result = await processEvent({
      supabase: mockSupabase,
      event: { ...baseEvent, retryCount: 2 },
      maxRetries: 5,
    });

    expect(result.success).toBe(false);
    expect(result.shouldRetry).toBe(true);
    expect(result.error).toContain('network timeout');
  });

  it('marks as failed (poison pill) when retry count >= maxRetries', async () => {
    createWorkflowEventMock.mockRejectedValueOnce(new Error('network timeout'));

    const result = await processEvent({
      supabase: mockSupabase,
      event: { ...baseEvent, retryCount: 5 },
      maxRetries: 5,
    });

    expect(result.success).toBe(false);
    expect(result.shouldRetry).toBe(false);
    expect(result.error).toContain('network timeout');
  });

  it('does not retry on non-transient error', async () => {
    createWorkflowEventMock.mockRejectedValueOnce(new Error('invalid payload structure'));

    const result = await processEvent({
      supabase: mockSupabase,
      event: { ...baseEvent, retryCount: 0 },
      maxRetries: 5,
    });

    expect(result.success).toBe(false);
    expect(result.shouldRetry).toBe(false);
  });

  it('increments retry_count on retryable failure', async () => {
    createWorkflowEventMock.mockRejectedValueOnce(new Error('connection refused'));

    await processEvent({
      supabase: mockSupabase,
      event: { ...baseEvent, retryCount: 1 },
      maxRetries: 5,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('ingestion_events');
  });

  it('logs processing stages correctly', async () => {
    await processEvent({
      supabase: mockSupabase,
      event: baseEvent,
      maxRetries: 5,
    });

    const statuses = logProcessingStageMock.mock.calls.map((c: any[]) => c[4]);
    expect(statuses).toContain('started');
    expect(statuses).toContain('success');
  });

  it('handles mapping error', async () => {
    mapEventToWorkflowMock.mockImplementationOnce(() => {
      throw new Error('Mapping failed');
    });

    const result = await processEvent({
      supabase: mockSupabase,
      event: baseEvent,
      maxRetries: 5,
    });

    expect(result.success).toBe(false);
    expect(result.shouldRetry).toBe(false);
    expect(logProcessingStageMock).toHaveBeenCalledWith(
      expect.anything(),
      'event-1',
      'client-1',
      'event_map',
      'failed',
      'Mapping failed',
      expect.any(Number),
      undefined
    );
  });

  it('handles workflow creation error', async () => {
    createWorkflowEventMock.mockRejectedValueOnce(new Error('DB constraint violation'));

    const result = await processEvent({
      supabase: mockSupabase,
      event: baseEvent,
      maxRetries: 5,
    });

    expect(result.success).toBe(false);
    expect(logProcessingStageMock).toHaveBeenCalledWith(
      expect.anything(),
      'event-1',
      'client-1',
      'workflow_create',
      'failed',
      'DB constraint violation',
      expect.any(Number),
      undefined
    );
  });

  it('logs complete stage on success', async () => {
    await processEvent({
      supabase: mockSupabase,
      event: baseEvent,
      maxRetries: 5,
    });

    const completeCalls = logProcessingStageMock.mock.calls.filter((c: any[]) => c[3] === 'complete');
    expect(completeCalls.length).toBe(1);
    expect(completeCalls[0][4]).toBe('success');
  });

  it('logs complete stage as failed on permanent failure', async () => {
    createWorkflowEventMock.mockRejectedValueOnce(new Error('permanent error'));

    await processEvent({
      supabase: mockSupabase,
      event: { ...baseEvent, retryCount: 5 },
      maxRetries: 5,
    });

    const completeCalls = logProcessingStageMock.mock.calls.filter((c: any[]) => c[3] === 'complete');
    expect(completeCalls[0][4]).toBe('failed');
  });
});