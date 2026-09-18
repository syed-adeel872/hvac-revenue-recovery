import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPendingEvents, processBatchOnce } from '@/lib/webhook/processor/processor';
import { claimEvents } from '@/lib/webhook/processor/claim-events';
import { processEvent } from '@/lib/webhook/processor/process-event';

vi.mock('@/lib/webhook/processor/claim-events', () => ({
  claimEvents: vi.fn(),
}));

vi.mock('@/lib/webhook/processor/process-event', () => ({
  processEvent: vi.fn(),
}));

const mockSupabase = {};

const baseEvent = {
  id: 'event-1',
  clientId: 'client-1',
  providerId: 'provider-1',
  providerName: 'ServiceTitan',
  externalEventId: 'ext-1',
  providerEventType: 'estimate.sent',
  internalEventType: 'estimate_sent',
  rawPayload: {},
  rawHeaders: {},
  idempotencyKey: 'key-1',
  providerEventTimestamp: null,
  receivedAt: '2024-01-01T00:00:00Z',
  status: 'received',
  retryCount: 0,
  metadata: {},
};

describe('processBatchOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when no events to claim', async () => {
    (claimEvents as any).mockResolvedValue([]);

    const result = await processBatchOnce({ supabase: mockSupabase });

    expect(result).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      results: [],
    });
  });

  it('processes single event successfully', async () => {
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: true, workflowEventId: 'wf-1' });

    const result = await processBatchOnce({ supabase: mockSupabase });

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
  });

  it('handles mix of success and retryable failure', async () => {
    (claimEvents as any).mockResolvedValue([
      { ...baseEvent, id: 'event-1' },
      { ...baseEvent, id: 'event-2' },
    ]);
    (processEvent as any)
      .mockResolvedValueOnce({ success: true, workflowEventId: 'wf-1' })
      .mockResolvedValueOnce({ success: false, shouldRetry: true, error: 'timeout' });

    const result = await processBatchOnce({ supabase: mockSupabase });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('handles permanent failure', async () => {
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: false, shouldRetry: false, error: 'permanent' });

    const result = await processBatchOnce({ supabase: mockSupabase });

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);
  });

  it('calls claimEvents with merged config', async () => {
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: true });

    await processBatchOnce({
      supabase: mockSupabase,
      config: { batchSize: 20, maxRetries: 3 },
    });

    expect(claimEvents).toHaveBeenCalledWith({
      supabase: mockSupabase,
      config: expect.objectContaining({ batchSize: 20, maxRetries: 3 }),
    });
  });

  it('passes maxRetries to processEvent', async () => {
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: true });

    await processBatchOnce({
      supabase: mockSupabase,
      config: { maxRetries: 3 },
    });

    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 3 })
    );
  });
});

describe('processPendingEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops when no events and pollIntervalMs <= 0', async () => {
    (claimEvents as any).mockResolvedValue([]);

    const result = await processPendingEvents({
      supabase: mockSupabase,
      config: { pollIntervalMs: 0, batchSize: 10 },
    });

    expect(result.total).toBe(0);
    expect(claimEvents).toHaveBeenCalledTimes(1);
  });

  it('processes single batch when pollIntervalMs = 0', async () => {
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: true, workflowEventId: 'wf-1' });

    const result = await processPendingEvents({
      supabase: mockSupabase,
      config: { pollIntervalMs: 0, batchSize: 1 },
    });

    expect(result.total).toBe(1);
    expect(claimEvents).toHaveBeenCalledTimes(1);
  });

  it('calls onBatchComplete callback', async () => {
    const onBatchComplete = vi.fn();
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: true, workflowEventId: 'wf-1' });

    await processPendingEvents({
      supabase: mockSupabase,
      config: { pollIntervalMs: 0, batchSize: 1 },
      onBatchComplete,
    });

    expect(onBatchComplete).toHaveBeenCalledTimes(1);
    expect(onBatchComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 1,
        succeeded: 1,
      })
    );
  });

  it('uses default config when not provided', async () => {
    (claimEvents as any).mockResolvedValue([baseEvent]);
    (processEvent as any).mockResolvedValue({ success: true });

    await processPendingEvents({ 
      supabase: mockSupabase,
      config: { pollIntervalMs: 0 },
    });

    expect(claimEvents).toHaveBeenCalledWith({
      supabase: mockSupabase,
      config: expect.objectContaining({
        batchSize: 10,
        maxRetries: 5,
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        pollIntervalMs: 0,
      }),
    });
  });
});