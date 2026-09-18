import { WebhookErrorCode, createError } from './errors';

export interface IngestionEventInput {
  clientId: string;
  providerId: string;
  externalEventId: string;
  providerEventType: string;
  internalEventType?: string;
  rawPayload: Record<string, unknown>;
  rawHeaders: Record<string, string>;
  idempotencyKey: string;
  providerEventTimestamp?: Date;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestionEventResult {
  id: string;
  isDuplicate: boolean;
}

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-signature',
  'x-webhook-signature',
  'x-hub-signature',
  'x-hub-signature-256',
  'stripe-signature',
  'x-github-delivery',
  'x-github-event',
  'x-gitlab-event',
  'x-shopify-hmac-sha256',
  'x-twilio-signature',
  'x-slack-signature',
  'x-slack-request-timestamp',
]);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowerKey) || lowerKey.startsWith('x-') && lowerKey.includes('sign')) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

export async function persistIngestionEvent(
  supabase: any,
  input: IngestionEventInput
): Promise<IngestionEventResult> {
  const { data, error } = await supabase
    .from('ingestion_events')
    .insert({
      client_id: input.clientId,
      provider_id: input.providerId,
      external_event_id: input.externalEventId,
      provider_event_type: input.providerEventType,
      internal_event_type: input.internalEventType,
      raw_payload: input.rawPayload,
      raw_headers: redactHeaders(input.rawHeaders),
      idempotency_key: input.idempotencyKey,
      provider_event_timestamp: input.providerEventTimestamp?.toISOString() ?? null,
      correlation_id: input.correlationId ?? null,
      metadata: input.metadata ?? {},
      status: 'received',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('ingestion_events')
        .select('id')
        .eq('client_id', input.clientId)
        .eq('provider_id', input.providerId)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();

      if (existing) {
        return { id: existing.id, isDuplicate: true };
      }
    }

    throw createError(
      WebhookErrorCode.PERSISTENCE_FAILED,
      `Failed to persist ingestion event: ${error.message}`,
      'Failed to persist event'
    );
  }

  return { id: data.id, isDuplicate: false };
}

export async function logProcessingStage(
  supabase: any,
  ingestionEventId: string,
  clientId: string,
  stage: string,
  status: 'started' | 'success' | 'failed' | 'retry',
  errorMessage?: string,
  durationMs?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('ingestion_processing_log').insert({
    ingestion_event_id: ingestionEventId,
    client_id: clientId,
    stage,
    status,
    error_message: errorMessage ?? null,
    duration_ms: durationMs ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    console.error('Failed to log processing stage:', error);
  }
}