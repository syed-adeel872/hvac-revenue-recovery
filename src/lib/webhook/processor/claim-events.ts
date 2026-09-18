import { ClaimedEvent, ProcessorConfig, DEFAULT_PROCESSOR_CONFIG } from './types';

export interface ClaimEventsOptions {
  supabase: any;
  config?: Partial<ProcessorConfig>;
}

export async function claimEvents(
  options: ClaimEventsOptions
): Promise<ClaimedEvent[]> {
  const { supabase, config } = options;
  const cfg = { ...DEFAULT_PROCESSOR_CONFIG, ...config };

  let query = supabase
    .from('ingestion_events')
    .select(`
      id,
      client_id,
      provider_id,
      external_event_id,
      provider_event_type,
      internal_event_type,
      raw_payload,
      raw_headers,
      idempotency_key,
      provider_event_timestamp,
      received_at,
      status,
      retry_count,
      metadata,
      webhook_providers!inner(provider_name)
    `)
    .in('status', ['received', 'retryable_failed'])
    .order('received_at', { ascending: true })
    .limit(cfg.batchSize);

  if (cfg.tenantId) {
    query = query.eq('client_id', cfg.tenantId);
  }

  const { data: events, error } = await query;

  if (error) {
    throw new Error(`Failed to claim events: ${error.message}`);
  }

  if (!events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((e: any) => e.id);

  const { data: updated, error: updateError } = await supabase
    .from('ingestion_events')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', eventIds)
    .in('status', ['received', 'retryable_failed'])
    .select('id, status');

  if (updateError) {
    throw new Error(`Failed to update event status to processing: ${updateError.message}`);
  }

  if (!updated || updated.length === 0) {
    return [];
  }

  const claimedIds = new Set(updated.map((e: any) => e.id));

  return events
    .filter((e: any) => claimedIds.has(e.id))
    .map((e: any) => ({
      id: e.id,
      clientId: e.client_id,
      providerId: e.provider_id,
      providerName: e.webhook_providers?.provider_name || 'unknown',
      externalEventId: e.external_event_id,
      providerEventType: e.provider_event_type,
      internalEventType: e.internal_event_type,
      rawPayload: e.raw_payload ?? {},
      rawHeaders: e.raw_headers ?? {},
      idempotencyKey: e.idempotency_key,
      providerEventTimestamp: e.provider_event_timestamp,
      receivedAt: e.received_at,
      status: e.status,
      retryCount: e.retry_count,
      metadata: e.metadata ?? {},
    }));
}