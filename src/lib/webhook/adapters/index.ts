export { GenericHMACAdapter, type GenericHMACConfig, type ExtractedEventInfo } from './generic-hmac';
export { BearerTokenAdapter, type BearerTokenConfig } from './bearer-token';
export { BasicAuthAdapter, type BasicAuthConfig } from './basic-auth';
export { ServiceTitanAdapter, type ServiceTitanAdapterConfig } from './servicetitan';

export type AuthType = 'hmac_sha256' | 'hmac_sha1' | 'bearer_token' | 'basic_auth' | 'servicetitan';

export interface ProviderAdapter {
  verify(
    rawBody: Uint8Array,
    headers: Record<string, string>,
    encryptedSecret: Uint8Array
  ): Promise<{ valid: boolean; error?: Error }>;

  extractEventInfo(rawBody: Uint8Array): {
    providerEventType: string;
    externalEventId: string;
    providerTimestamp?: Date;
    idempotencyInput: string;
  };
}

export function createAdapter(authType: AuthType, config: Record<string, unknown>): ProviderAdapter {
  switch (authType) {
    case 'hmac_sha256':
    case 'hmac_sha1': {
      const { GenericHMACAdapter } = require('./generic-hmac');
      return new GenericHMACAdapter({
        headerName: (config.headerName as string) || 'x-signature',
        eventTypeField: config.eventTypeField as string,
        externalEventIdField: config.externalEventIdField as string,
        timestampField: config.timestampField as string | undefined,
      });
    }
    case 'bearer_token': {
      const { BearerTokenAdapter } = require('./bearer-token');
      return new BearerTokenAdapter({
        eventTypeField: config.eventTypeField as string,
        externalEventIdField: config.externalEventIdField as string,
        timestampField: config.timestampField as string | undefined,
      });
    }
    case 'basic_auth': {
      const { BasicAuthAdapter } = require('./basic-auth');
      return new BasicAuthAdapter({
        eventTypeField: config.eventTypeField as string,
        externalEventIdField: config.externalEventIdField as string,
        timestampField: config.timestampField as string | undefined,
      });
    }
    case 'servicetitan': {
      const { ServiceTitanAdapter } = require('./servicetitan');
      return new ServiceTitanAdapter({
        signatureHeader: (config.headerName as string) || 'x-st-webhook-signature',
      });
    }
    default:
      throw new Error(`Unsupported auth type: ${authType}`);
  }
}