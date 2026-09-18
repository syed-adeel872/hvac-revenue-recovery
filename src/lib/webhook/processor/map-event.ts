import { ClaimedEvent, MapResult } from './types';

export function mapEventToWorkflow(event: ClaimedEvent): MapResult {
  const eventType = event.internalEventType || event.providerEventType || 'unknown';
  const eventSource = `webhook:${event.providerName.toLowerCase()}`;

  const payload = {
    provider_id: event.providerId,
    provider_name: event.providerName,
    internal_event_type: eventType,
    raw_payload: event.rawPayload,
    received_at: event.receivedAt,
  };

  const metadata = {
    provider_event_type: event.providerEventType,
    external_event_id: event.externalEventId,
    provider_timestamp: event.providerEventTimestamp,
    idempotency_key: event.idempotencyKey,
    retry_count: event.retryCount,
    ...event.metadata,
  };

  return {
    eventType,
    eventSource,
    payload,
    metadata,
  };
}