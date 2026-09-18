import { describe, it, expect } from 'vitest';
import { resolveTenantFromProvider, validateTenantConsistency } from '@/lib/webhook/resolve-tenant';
import { WebhookErrorCode } from '@/lib/webhook/errors';

describe('resolve-tenant', () => {
  const baseProviderConfig = {
    id: 'provider_123',
    clientId: 'client_456',
    providerName: 'test-provider',
    authType: 'hmac_sha256' as const,
    headerName: 'x-signature',
    eventTypeMapping: {},
    tenantResolution: { strategy: 'credential_based' as const },
    maxPayloadSizeBytes: 1024 * 1024,
  };

  describe('resolveTenantFromProvider', () => {
    it('resolves tenant from credential-based strategy', async () => {
      const body = new TextEncoder().encode(JSON.stringify({ event_type: 'test', event_id: '123' }));

      const result = await resolveTenantFromProvider(baseProviderConfig, body);

      expect(result.clientId).toBe('client_456');
      expect(result.providerId).toBe('provider_123');
    });

    it('resolves tenant from payload account_id when strategy matches', async () => {
      const config = {
        ...baseProviderConfig,
        tenantResolution: { strategy: 'payload_account_id' as const },
      };
      const payload = {
        event_type: 'test',
        event_id: '123',
        account_id: 'client_456',
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const result = await resolveTenantFromProvider(config, body);

      expect(result.clientId).toBe('client_456');
      expect(result.providerId).toBe('provider_123');
    });

    it('rejects mismatched account_id in payload', async () => {
      const config = {
        ...baseProviderConfig,
        tenantResolution: { strategy: 'payload_account_id' as const },
      };
      const payload = {
        event_type: 'test',
        event_id: '123',
        account_id: 'different_client',
      };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      await expect(resolveTenantFromProvider(config, body)).rejects.toThrow();
      try {
        await resolveTenantFromProvider(config, body);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.CROSS_TENANT_REJECTED);
      }
    });

    it('rejects missing account_id when strategy requires it', async () => {
      const config = {
        ...baseProviderConfig,
        tenantResolution: { strategy: 'payload_account_id' as const },
      };
      const payload = { event_type: 'test', event_id: '123' };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      await expect(resolveTenantFromProvider(config, body)).rejects.toThrow();
      try {
        await resolveTenantFromProvider(config, body);
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.TENANT_MISMATCH);
      }
    });

    it('extracts account_id from various field names', async () => {
      const config = {
        ...baseProviderConfig,
        tenantResolution: { strategy: 'payload_account_id' as const },
      };

      const fieldNames = ['account_id', 'accountId', 'tenant_id', 'tenantId', 'client_id', 'clientId', 'organization_id', 'organizationId', 'org_id', 'orgId'];

      for (const fieldName of fieldNames) {
        const payload = { event_type: 'test', event_id: '123', [fieldName]: 'client_456' };
        const body = new TextEncoder().encode(JSON.stringify(payload));

        const result = await resolveTenantFromProvider(config, body);
        expect(result.clientId).toBe('client_456');
      }
    });

    it('extracts account_id from nested data object', async () => {
      const config = {
        ...baseProviderConfig,
        tenantResolution: { strategy: 'payload_account_id' as const },
      };
      const payload = { event_type: 'test', event_id: '123', data: { account_id: 'client_456' } };
      const body = new TextEncoder().encode(JSON.stringify(payload));

      const result = await resolveTenantFromProvider(config, body);
      expect(result.clientId).toBe('client_456');
    });
  });

  describe('validateTenantConsistency', () => {
    it('passes when no conflicting client_id provided', () => {
      expect(() => validateTenantConsistency('client_456')).not.toThrow();
    });

    it('passes when request client_id matches resolved', () => {
      expect(() => validateTenantConsistency('client_456', 'client_456')).not.toThrow();
    });

    it('rejects when request client_id mismatches resolved', () => {
      expect(() => validateTenantConsistency('client_456', 'different_client')).toThrow();
      try {
        validateTenantConsistency('client_456', 'different_client');
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.CROSS_TENANT_REJECTED);
      }
    });

    it('rejects when x-client-id header mismatches resolved', () => {
      expect(() => validateTenantConsistency('client_456', undefined, { 'x-client-id': 'different_client' })).toThrow();
      try {
        validateTenantConsistency('client_456', undefined, { 'x-client-id': 'different_client' });
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.CROSS_TENANT_REJECTED);
      }
    });

    it('rejects when X-Client-ID header mismatches resolved', () => {
      expect(() => validateTenantConsistency('client_456', undefined, { 'X-Client-ID': 'different_client' })).toThrow();
      try {
        validateTenantConsistency('client_456', undefined, { 'X-Client-ID': 'different_client' });
      } catch (error: any) {
        expect(error.code).toBe(WebhookErrorCode.CROSS_TENANT_REJECTED);
      }
    });

    it('passes when header client_id matches resolved', () => {
      expect(() => validateTenantConsistency('client_456', undefined, { 'x-client-id': 'client_456' })).not.toThrow();
    });
  });
});