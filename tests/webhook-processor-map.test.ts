import { describe, it, expect } from 'vitest';
import { mapEventToWorkflow } from '@/lib/webhook/processor/map-event';
import { ClaimedEvent } from '@/lib/webhook/processor/types';

describe('mapEventToWorkflow', () => {
  const baseEvent: ClaimedEvent = {
    id: 'event-1',
    clientId: 'client-1',
    providerId: 'provider-1',
    providerName: 'ServiceTitan',
    externalEventId: 'ext-123',
    providerEventType: 'estimate.created',
    internalEventType: 'estimate_sent',
    rawPayload: { estimateId: 'est-1', amount: 5000 },
    rawHeaders: { 'content-type': 'application/json' },
    idempotencyKey: 'key-abc',
    providerEventTimestamp: '2024-01-15T10:30:00Z',
    receivedAt: '2024-01-15T10:30:05Z',
    status: 'received',
    retryCount: 0,
    metadata: { custom: 'data' },
  };

  it('maps event with internalEventType', () => {
    const result = mapEventToWorkflow(baseEvent);

    expect(result.eventType).toBe('estimate_sent');
    expect(result.eventSource).toBe('webhook:servicetitan');
  });

  it('falls back to providerEventType when internalEventType is null', () => {
    const event = { ...baseEvent, internalEventType: null };
    const result = mapEventToWorkflow(event);

    expect(result.eventType).toBe('estimate.created');
  });

  it('falls back to unknown when both are missing', () => {
    const event = { ...baseEvent, internalEventType: null, providerEventType: '' };
    const result = mapEventToWorkflow(event);

    expect(result.eventType).toBe('unknown');
  });

  it('normalizes provider name to lowercase in eventSource', () => {
    const event = { ...baseEvent, providerName: 'HouseCall Pro' };
    const result = mapEventToWorkflow(event);

    expect(result.eventSource).toBe('webhook:housecall pro');
  });

  it('includes required payload fields', () => {
    const result = mapEventToWorkflow(baseEvent);

    expect(result.payload).toEqual({
      provider_id: 'provider-1',
      provider_name: 'ServiceTitan',
      internal_event_type: 'estimate_sent',
      raw_payload: { estimateId: 'est-1', amount: 5000 },
      received_at: '2024-01-15T10:30:05Z',
    });
  });

  it('includes metadata with all tracking fields', () => {
    const result = mapEventToWorkflow(baseEvent);

    expect(result.metadata).toEqual({
      provider_event_type: 'estimate.created',
      external_event_id: 'ext-123',
      provider_timestamp: '2024-01-15T10:30:00Z',
      idempotency_key: 'key-abc',
      retry_count: 0,
      custom: 'data',
    });
  });

  it('handles missing optional fields gracefully', () => {
    const event: ClaimedEvent = {
      ...baseEvent,
      providerEventTimestamp: null,
      metadata: {},
    };

    const result = mapEventToWorkflow(event);

    expect(result.metadata.provider_timestamp).toBeNull();
    expect(result.metadata.retry_count).toBe(0);
  });

  it('does not expose rawHeaders in payload or metadata', () => {
    const result = mapEventToWorkflow(baseEvent);

    expect(result.payload).not.toHaveProperty('rawHeaders');
    expect(result.metadata).not.toHaveProperty('rawHeaders');
  });

  it('preserves original payload structure', () => {
    const complexPayload = {
      nested: { key: 'value' },
      array: [1, 2, 3],
      string: 'test',
    };
    const event = { ...baseEvent, rawPayload: complexPayload };
    const result = mapEventToWorkflow(event);

    expect(result.payload.raw_payload).toEqual(complexPayload);
  });
});