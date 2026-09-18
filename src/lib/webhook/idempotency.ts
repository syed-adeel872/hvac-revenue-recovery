import { createHash } from 'crypto';
import { WebhookErrorCode, createError } from './errors';

export interface IdempotencyKeyComponents {
  providerId: string;
  externalEventId: string;
  providerTimestamp?: Date;
}

export function computeIdempotencyKey(components: IdempotencyKeyComponents): string {
  const parts = [components.providerId, components.externalEventId];

  if (components.providerTimestamp) {
    parts.push(components.providerTimestamp.toISOString());
  }

  const combined = parts.join('|');
  return createHash('sha256').update(combined).digest('hex').slice(0, 64);
}

export function computeIdempotencyKeyFromAdapterInput(idempotencyInput: string, providerId: string): string {
  const combined = `${providerId}|${idempotencyInput}`;
  return createHash('sha256').update(combined).digest('hex').slice(0, 64);
}

export interface IdempotencyResult {
  isDuplicate: boolean;
  ingestionEventId?: string;
  idempotencyKey: string;
}

export async function checkAndReserveIdempotency(
  supabase: any,
  clientId: string,
  providerId: string,
  idempotencyKey: string
): Promise<IdempotencyResult> {
  const { data: existing, error: selectError } = await supabase
    .from('ingestion_events')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider_id', providerId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (selectError) {
    throw createError(
      WebhookErrorCode.PERSISTENCE_FAILED,
      'Failed to check idempotency',
      'Internal error'
    );
  }

  if (existing) {
    return {
      isDuplicate: true,
      ingestionEventId: existing.id,
      idempotencyKey,
    };
  }

  return {
    isDuplicate: false,
    idempotencyKey,
  };
}