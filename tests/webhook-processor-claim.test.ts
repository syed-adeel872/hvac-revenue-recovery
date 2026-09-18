import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimEvents } from '@/lib/webhook/processor/claim-events';

const createMockChain = (mockData: any = { data: [], error: null }) => {
  const chain: any = {};
  
  const methods = ['select', 'in', 'eq', 'order', 'limit', 'update', 'single'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  
  // Make the chain thenable (awaitable)
  chain.then = vi.fn((onFulfilled) => Promise.resolve(mockData).then(onFulfilled));
  
  return chain;
};

const createMockSupabase = () => {
  let selectChain = createMockChain();
  let updateChain = createMockChain();

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'ingestion_events') {
        return {
          select: vi.fn(() => selectChain),
          update: vi.fn(() => updateChain),
        };
      }
      return createMockChain();
    }),
    _getSelectChain: () => selectChain,
    _getUpdateChain: () => updateChain,
    _setSelectChain: (chain: any) => { selectChain = chain; },
    _setUpdateChain: (chain: any) => { updateChain = chain; },
  };

  return supabase;
};

describe('claimEvents', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  it('claims events with received status', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        client_id: 'client-1',
        provider_id: 'provider-1',
        external_event_id: 'ext-1',
        provider_event_type: 'estimate.sent',
        internal_event_type: 'estimate_sent',
        raw_payload: { foo: 'bar' },
        raw_headers: { 'x-signature': 'sig' },
        idempotency_key: 'key-1',
        provider_event_timestamp: '2024-01-01T00:00:00Z',
        received_at: '2024-01-01T00:00:00Z',
        status: 'received',
        retry_count: 0,
        metadata: {},
        webhook_providers: { provider_name: 'servicetitan' },
      },
    ];

    mockSupabase._setSelectChain(createMockChain({ data: mockEvents, error: null }));
    mockSupabase._setUpdateChain(createMockChain({ data: [{ id: 'event-1', status: 'processing' }], error: null }));

    const result = await claimEvents({
      supabase: mockSupabase,
      config: { batchSize: 10 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('event-1');
    expect(result[0].clientId).toBe('client-1');
    expect(result[0].status).toBe('received');
    expect(mockSupabase.from).toHaveBeenCalledWith('ingestion_events');
  });

  it('claims events with retryable_failed status', async () => {
    const mockEvents = [
      {
        id: 'event-2',
        client_id: 'client-1',
        provider_id: 'provider-1',
        external_event_id: 'ext-2',
        provider_event_type: 'estimate.sent',
        internal_event_type: null,
        raw_payload: {},
        raw_headers: {},
        idempotency_key: 'key-2',
        provider_event_timestamp: null,
        received_at: '2024-01-01T00:00:00Z',
        status: 'retryable_failed',
        retry_count: 1,
        metadata: {},
        webhook_providers: { provider_name: 'housecall' },
      },
    ];

    mockSupabase._setSelectChain(createMockChain({ data: mockEvents, error: null }));
    mockSupabase._setUpdateChain(createMockChain({ data: [{ id: 'event-2', status: 'processing' }], error: null }));

    const result = await claimEvents({
      supabase: mockSupabase,
      config: { batchSize: 10 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('retryable_failed');
    expect(result[0].retryCount).toBe(1);
  });

  it('respects tenant isolation', async () => {
    mockSupabase._setSelectChain(createMockChain({ data: [], error: null }));

    await claimEvents({
      supabase: mockSupabase,
      config: { batchSize: 10, tenantId: 'client-1' },
    });

    const selectChain = mockSupabase._getSelectChain();
    expect(selectChain.eq).toHaveBeenCalledWith('client_id', 'client-1');
  });

  it('returns empty array when no events available', async () => {
    mockSupabase._setSelectChain(createMockChain({ data: [], error: null }));

    const result = await claimEvents({
      supabase: mockSupabase,
      config: { batchSize: 10 },
    });

    expect(result).toEqual([]);
  });

  it('throws on select error', async () => {
    mockSupabase._setSelectChain(createMockChain({ data: null, error: { message: 'DB error' } }));

    await expect(
      claimEvents({ supabase: mockSupabase })
    ).rejects.toThrow('Failed to claim events: DB error');
  });

  it('throws on update error', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        client_id: 'client-1',
        provider_id: 'provider-1',
        external_event_id: 'ext-1',
        provider_event_type: 'estimate.sent',
        internal_event_type: 'estimate_sent',
        raw_payload: {},
        raw_headers: {},
        idempotency_key: 'key-1',
        provider_event_timestamp: null,
        received_at: '2024-01-01T00:00:00Z',
        status: 'received',
        retry_count: 0,
        metadata: {},
        webhook_providers: { provider_name: 'servicetitan' },
      },
    ];

    mockSupabase._setSelectChain(createMockChain({ data: mockEvents, error: null }));
    mockSupabase._setUpdateChain(createMockChain({ data: null, error: { message: 'Update failed' } }));

    await expect(
      claimEvents({ supabase: mockSupabase })
    ).rejects.toThrow('Failed to update event status to processing: Update failed');
  });

  it('returns empty array when no rows were updated (concurrent claim)', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        client_id: 'client-1',
        provider_id: 'provider-1',
        external_event_id: 'ext-1',
        provider_event_type: 'estimate.sent',
        internal_event_type: 'estimate_sent',
        raw_payload: {},
        raw_headers: {},
        idempotency_key: 'key-1',
        provider_event_timestamp: null,
        received_at: '2024-01-01T00:00:00Z',
        status: 'received',
        retry_count: 0,
        metadata: {},
        webhook_providers: { provider_name: 'servicetitan' },
      },
    ];

    mockSupabase._setSelectChain(createMockChain({ data: mockEvents, error: null }));
    mockSupabase._setUpdateChain(createMockChain({ data: [], error: null }));

    const result = await claimEvents({
      supabase: mockSupabase,
      config: { batchSize: 10 },
    });

    expect(result).toEqual([]);
  });

  it('orders by received_at ascending', async () => {
    mockSupabase._setSelectChain(createMockChain({ data: [], error: null }));

    await claimEvents({ supabase: mockSupabase });

    const selectChain = mockSupabase._getSelectChain();
    expect(selectChain.order).toHaveBeenCalledWith('received_at', { ascending: true });
  });

  it('limits to batchSize', async () => {
    mockSupabase._setSelectChain(createMockChain({ data: [], error: null }));

    await claimEvents({ supabase: mockSupabase, config: { batchSize: 5 } });

    const selectChain = mockSupabase._getSelectChain();
    expect(selectChain.limit).toHaveBeenCalledWith(5);
  });
});