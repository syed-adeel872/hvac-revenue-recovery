import { verifySignature, VerificationResult } from '../verify-signature';
import { WebhookErrorCode, createError } from '../errors';
import { validateServiceTitanPayload, ValidatedServiceTitanEvent } from '../servicetitan-schema';

export interface ServiceTitanAdapterConfig {
  signatureHeader?: string;
}

export class ServiceTitanAdapter {
  private config: ServiceTitanAdapterConfig;

  constructor(config: ServiceTitanAdapterConfig = {}) {
    this.config = {
      signatureHeader: config.signatureHeader || 'x-st-webhook-signature',
    };
  }

  async verify(
    rawBody: Uint8Array,
    headers: Record<string, string>,
    encryptedSecret: Uint8Array
  ): Promise<VerificationResult> {
    return verifySignature({
      authType: 'hmac_sha256',
      rawBody,
      headers,
      encryptedSecret,
      headerName: this.config.signatureHeader,
    });
  }

  extractEventInfo(rawBody: Uint8Array): {
    providerEventType: string;
    externalEventId: string;
    providerTimestamp?: Date;
    idempotencyInput: string;
    validatedEvent: ValidatedServiceTitanEvent;
  } {
    const event = validateServiceTitanPayload(rawBody);

    const idempotencyInput = [
      event.eventType,
      event.correlationId,
      event.timestamp.toISOString(),
    ].join('|');

    return {
      providerEventType: event.eventType,
      externalEventId: event.correlationId,
      providerTimestamp: event.timestamp,
      idempotencyInput,
      validatedEvent: event,
    };
  }
}
