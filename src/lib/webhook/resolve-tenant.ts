import { WebhookErrorCode, createError } from './errors';

export interface ResolvedTenant {
  clientId: string;
  providerId: string;
}

export interface ProviderConfig {
  id: string;
  clientId: string;
  providerName: string;
  authType: 'hmac_sha256' | 'hmac_sha1' | 'bearer_token' | 'basic_auth';
  headerName?: string;
  eventTypeMapping: Record<string, string>;
  tenantResolution: { strategy: string };
  maxPayloadSizeBytes: number;
}

export async function resolveTenantFromProvider(
  providerConfig: ProviderConfig,
  rawBody: Uint8Array
): Promise<ResolvedTenant> {
  const strategy = providerConfig.tenantResolution?.strategy || 'credential_based';

  switch (strategy) {
    case 'credential_based': {
      return {
        clientId: providerConfig.clientId,
        providerId: providerConfig.id,
      };
    }

    case 'payload_account_id': {
      const accountId = extractAccountIdFromPayload(rawBody);
      if (!accountId) {
        throw createError(
          WebhookErrorCode.TENANT_MISMATCH,
          'Provider requires account ID in payload but none found',
          'Tenant resolution failed'
        );
      }

      if (accountId !== providerConfig.clientId) {
        throw createError(
          WebhookErrorCode.CROSS_TENANT_REJECTED,
          'Payload account ID does not match provider configuration',
          'Tenant mismatch'
        );
      }

      return {
        clientId: providerConfig.clientId,
        providerId: providerConfig.id,
      };
    }

    default:
      throw createError(
        WebhookErrorCode.INVALID_REQUEST,
        `Unknown tenant resolution strategy: ${strategy}`,
        'Configuration error'
      );
  }
}

function extractAccountIdFromPayload(rawBody: Uint8Array): string | undefined {
  try {
    const text = new TextDecoder().decode(rawBody);
    const payload = JSON.parse(text);

    const candidates = [
      'account_id',
      'accountId',
      'tenant_id',
      'tenantId',
      'client_id',
      'clientId',
      'organization_id',
      'organizationId',
      'org_id',
      'orgId',
    ];

    for (const key of candidates) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    if (payload.data && typeof payload.data === 'object') {
      for (const key of candidates) {
        const value = (payload.data as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function validateTenantConsistency(
  resolvedClientId: string,
  requestClientId?: string,
  requestHeaders?: Record<string, string>
): void {
  if (requestClientId && requestClientId !== resolvedClientId) {
    throw createError(
      WebhookErrorCode.CROSS_TENANT_REJECTED,
      'Client ID in request does not match resolved tenant',
      'Tenant mismatch'
    );
  }

  const headerClientId = requestHeaders?.['x-client-id'] || requestHeaders?.['X-Client-ID'];
  if (headerClientId && headerClientId !== resolvedClientId) {
    throw createError(
      WebhookErrorCode.CROSS_TENANT_REJECTED,
      'Client ID in header does not match resolved tenant',
      'Tenant mismatch'
    );
  }
}