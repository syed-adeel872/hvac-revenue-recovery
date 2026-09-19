import { z } from 'zod';
import { WebhookErrorCode, createError } from './errors';

export const ServiceTitanEventSchema = z.object({
  Type: z.string().min(1),
  CorrelationId: z.string().min(1),
  Timestamp: z.string().min(1),
  Data: z.record(z.unknown()).optional(),
});

export type ServiceTitanEvent = z.infer<typeof ServiceTitanEventSchema>;

export interface ValidatedServiceTitanEvent {
  eventType: string;
  correlationId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export function validateServiceTitanPayload(rawBody: Uint8Array): ValidatedServiceTitanEvent {
  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(rawBody);
    parsed = JSON.parse(text);
  } catch {
    throw createError(
      WebhookErrorCode.MALFORMED_JSON,
      'ServiceTitan webhook body is not valid JSON',
      'Invalid payload format'
    );
  }

  const result = ServiceTitanEventSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw createError(
      WebhookErrorCode.SCHEMA_VALIDATION_FAILED,
      `ServiceTitan schema validation failed: ${issues}`,
      'Invalid ServiceTitan payload'
    );
  }

  const data = result.data;

  let timestamp: Date;
  try {
    timestamp = new Date(data.Timestamp);
    if (isNaN(timestamp.getTime())) {
      throw new Error('Invalid date');
    }
  } catch {
    throw createError(
      WebhookErrorCode.SCHEMA_VALIDATION_FAILED,
      `ServiceTitan timestamp is invalid: ${data.Timestamp}`,
      'Invalid timestamp'
    );
  }

  return {
    eventType: data.Type,
    correlationId: data.CorrelationId,
    timestamp,
    data: data.Data ?? {},
  };
}
