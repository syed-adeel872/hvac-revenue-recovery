import { z } from 'zod';
import { WebhookErrorCode, createError } from './errors';

const baseEventSchema = z.object({
  event_type: z.string().min(1).max(100),
  event_id: z.string().min(1).max(200),
  timestamp: z.union([z.string(), z.number()]).optional(),
  payload: z.record(z.unknown()).optional(),
});

const maxPayloadSize = 1024 * 1024;

export interface ValidatedEvent {
  providerEventType: string;
  externalEventId: string;
  providerTimestamp?: Date;
  rawPayload: Record<string, unknown>;
}

export function validateWebhookPayload(rawBody: Uint8Array): ValidatedEvent {
  if (rawBody.length > maxPayloadSize) {
    throw createError(
      WebhookErrorCode.PAYLOAD_TOO_LARGE,
      `Payload exceeds maximum size of ${maxPayloadSize} bytes`,
      'Payload too large'
    );
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(rawBody);
    parsed = JSON.parse(text);
  } catch {
    throw createError(
      WebhookErrorCode.MALFORMED_JSON,
      'Request body is not valid JSON',
      'Invalid JSON'
    );
  }

  const result = baseEventSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw createError(
      WebhookErrorCode.SCHEMA_VALIDATION_FAILED,
      `Schema validation failed: ${issues}`,
      'Invalid payload structure'
    );
  }

  const data = result.data;

  let providerTimestamp: Date | undefined;
  if (data.timestamp !== undefined) {
    if (typeof data.timestamp === 'string') {
      const parsed = new Date(data.timestamp);
      if (!isNaN(parsed.getTime())) {
        providerTimestamp = parsed;
      }
    } else if (typeof data.timestamp === 'number') {
      providerTimestamp = new Date(data.timestamp > 1e12 ? data.timestamp : data.timestamp * 1000);
    }
  }

  return {
    providerEventType: data.event_type,
    externalEventId: data.event_id,
    providerTimestamp,
    rawPayload: data.payload ?? {},
  };
}

export function validateProviderConfig(config: unknown): {
  providerName: string;
  authType: 'hmac_sha256' | 'hmac_sha1' | 'bearer_token' | 'basic_auth';
  eventTypeMapping: Record<string, string>;
  tenantResolution: { strategy: string };
  maxPayloadSizeBytes: number;
  headerName?: string;
} {
  const configSchema = z.object({
    provider_name: z.string().min(1).max(100),
    auth_type: z.enum(['hmac_sha256', 'hmac_sha1', 'bearer_token', 'basic_auth']),
    event_type_mapping: z.record(z.string()).optional().default({}),
    tenant_resolution: z.object({ strategy: z.string() }).optional().default({ strategy: 'credential_based' }),
    max_payload_size_bytes: z.number().int().positive().max(10 * 1024 * 1024).optional().default(1024 * 1024),
    header_name: z.string().optional(),
  });

  const result = configSchema.safeParse(config);

  if (!result.success) {
    throw createError(
      WebhookErrorCode.INVALID_REQUEST,
      'Invalid provider configuration',
      'Provider configuration error'
    );
  }

  return {
    providerName: result.data.provider_name,
    authType: result.data.auth_type,
    eventTypeMapping: result.data.event_type_mapping,
    tenantResolution: result.data.tenant_resolution,
    maxPayloadSizeBytes: result.data.max_payload_size_bytes,
    headerName: result.data.header_name,
  };
}