import { verifySignature, VerificationResult } from '../verify-signature';
import { WebhookErrorCode, createError } from '../errors';

export interface BasicAuthConfig {
  eventTypeField: string;
  externalEventIdField: string;
  timestampField?: string;
}

export interface ExtractedEventInfo {
  providerEventType: string;
  externalEventId: string;
  providerTimestamp?: Date;
  idempotencyInput: string;
}

export class BasicAuthAdapter {
  private config: BasicAuthConfig;

  constructor(config: BasicAuthConfig) {
    this.config = {
      eventTypeField: config.eventTypeField,
      externalEventIdField: config.externalEventIdField,
      timestampField: config.timestampField,
    };
  }

  async verify(
    rawBody: Uint8Array,
    headers: Record<string, string>,
    encryptedSecret: Uint8Array
  ): Promise<VerificationResult> {
    return verifySignature({
      authType: 'basic_auth',
      rawBody,
      headers,
      encryptedSecret,
    });
  }

  extractEventInfo(rawBody: Uint8Array): ExtractedEventInfo {
    let payload: Record<string, unknown>;
    try {
      const text = new TextDecoder().decode(rawBody);
      payload = JSON.parse(text);
    } catch {
      throw createError(
        WebhookErrorCode.MALFORMED_JSON,
        'Failed to parse webhook payload as JSON',
        'Invalid payload format'
      );
    }

    const providerEventType = this.extractString(payload, this.config.eventTypeField);
    const externalEventId = this.extractString(payload, this.config.externalEventIdField);

    if (!providerEventType) {
      throw createError(
        WebhookErrorCode.SCHEMA_VALIDATION_FAILED,
        `Missing required field: ${this.config.eventTypeField}`,
        'Missing event type'
      );
    }

    if (!externalEventId) {
      throw createError(
        WebhookErrorCode.SCHEMA_VALIDATION_FAILED,
        `Missing required field: ${this.config.externalEventIdField}`,
        'Missing external event ID'
      );
    }

    let providerTimestamp: Date | undefined;
    if (this.config.timestampField) {
      const timestampValue = payload[this.config.timestampField];
      if (timestampValue) {
        const parsed = this.parseTimestamp(timestampValue);
        if (parsed) {
          providerTimestamp = parsed;
        }
      }
    }

    const idempotencyInput = this.computeIdempotencyInput(providerEventType, externalEventId, providerTimestamp);

    return {
      providerEventType,
      externalEventId,
      providerTimestamp,
      idempotencyInput,
    };
  }

  private extractString(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === 'string' ? current : undefined;
  }

  private parseTimestamp(value: unknown): Date | undefined {
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
      const asNumber = Number(value);
      if (!isNaN(asNumber)) {
        return new Date(asNumber > 1e12 ? asNumber : asNumber * 1000);
      }
    } else if (typeof value === 'number') {
      return new Date(value > 1e12 ? value : value * 1000);
    }
    return undefined;
  }

  private computeIdempotencyInput(
    providerEventType: string,
    externalEventId: string,
    providerTimestamp?: Date
  ): string {
    const parts = [providerEventType, externalEventId];
    if (providerTimestamp) {
      parts.push(providerTimestamp.toISOString());
    }
    return parts.join('|');
  }
}