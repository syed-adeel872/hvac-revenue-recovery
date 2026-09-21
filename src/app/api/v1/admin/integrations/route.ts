import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthOrCron } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/webhook/encryption';
import { resolveClientId } from '@/lib/admin-tenant';
import { z } from 'zod';

const IntegrationCreateSchema = z.object({
  providerName: z.enum(['servicetitan', 'twilio']),
  credentials: z.record(z.string().min(1)),
  config: z.record(z.unknown()).optional(),
});

const IntegrationUpdateSchema = z.object({
  providerId: z.string().uuid(),
  credentials: z.record(z.string().min(1)).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const PROVIDER_FIELDS: Record<string, { label: string; secretFields: string[]; configFields: string[] }> = {
  servicetitan: {
    label: 'ServiceTitan',
    secretFields: ['client_secret', 'hmac_key'],
    configFields: ['tenant_id', 'client_id'],
  },
  twilio: {
    label: 'Twilio',
    secretFields: ['auth_token'],
    configFields: ['account_sid', 'from_number'],
  },
};

function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.substring(0, 2) + '*'.repeat(Math.min(value.length - 4, 12)) + value.substring(value.length - 2);
}

function classifyFields(
  providerName: string,
  credentials: Record<string, string>,
  config: Record<string, unknown> = {}
): { secrets: Record<string, string>; plainConfig: Record<string, unknown> } {
  const providerDef = PROVIDER_FIELDS[providerName];
  if (!providerDef) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const secrets: Record<string, string> = {};
  const plainConfig: Record<string, unknown> = { ...config };

  for (const [key, value] of Object.entries(credentials)) {
    if (providerDef.secretFields.includes(key)) {
      secrets[key] = value;
    } else if (providerDef.configFields.includes(key)) {
      plainConfig[key] = value;
    }
  }

  return { secrets, plainConfig };
}

export async function GET(request: NextRequest) {
  const user = await verifyAuthOrCron(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);

    const { searchParams } = new URL(request.url);
    const providerName = searchParams.get('provider');

    let query = supabase
      .from('webhook_providers')
      .select('id, provider_name, display_name, status, auth_type, event_type_mapping, tenant_resolution, created_at, updated_at')
      .eq('client_id', clientId);

    if (providerName) {
      query = query.eq('provider_name', providerName);
    }

    const { data: providers, error: providersError } = await query;

    if (providersError) {
      console.error('[Integrations] Failed to fetch providers:', providersError.message);
      return NextResponse.json(
        { error: 'Failed to fetch integrations' },
        { status: 500 }
      );
    }

    const integrations = await Promise.all(
      (providers || []).map(async (provider: any) => {
        const { data: credentials } = await supabase
          .from('webhook_credentials')
          .select('id, secret_version, created_at, expires_at')
          .eq('provider_id', provider.id)
          .order('secret_version', { ascending: false })
          .limit(1);

        const latestCredential = credentials?.[0];

        const providerDef = PROVIDER_FIELDS[provider.provider_name];
        const maskedSecrets: Record<string, string> = {};
        if (providerDef) {
          for (const field of providerDef.secretFields) {
            maskedSecrets[field] = '••••••••';
          }
        }

        return {
          id: provider.id,
          providerName: provider.provider_name,
          displayName: provider.display_name || providerDef?.label || provider.provider_name,
          status: provider.status,
          authType: provider.auth_type,
          config: provider.event_type_mapping || {},
          maskedSecrets,
          credentialVersion: latestCredential?.secret_version || 0,
          credentialCreatedAt: latestCredential?.created_at || null,
          credentialExpiresAt: latestCredential?.expires_at || null,
          createdAt: provider.created_at,
          updatedAt: provider.updated_at,
        };
      })
    );

    return NextResponse.json({ integrations });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Integrations:GET] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyAuthOrCron(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const parsed = IntegrationCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const clientId = await resolveClientId(supabase, user.id);

    const { providerName, credentials, config: rawConfig } = parsed.data;
    const providerDef = PROVIDER_FIELDS[providerName];

    if (!providerDef) {
      return NextResponse.json({ error: `Unknown provider: ${providerName}` }, { status: 400 });
    }

    const requiredSecretFields = providerDef.secretFields;
    for (const field of requiredSecretFields) {
      if (!credentials[field]) {
        return NextResponse.json(
          { error: `Missing required credential: ${field}` },
          { status: 400 }
        );
      }
    }

    const { secrets, plainConfig } = classifyFields(providerName, credentials, rawConfig);

    const authType = providerName === 'servicetitan' ? 'hmac_sha256' : 'basic_auth';
    const headerName = providerName === 'servicetitan' ? 'x-st-webhook-signature' : undefined;

    const { data: existingProvider } = await supabase
      .from('webhook_providers')
      .select('id')
      .eq('client_id', clientId)
      .eq('provider_name', providerName)
      .eq('status', 'active')
      .single();

    let providerId: string;

    if (existingProvider) {
        const { error: updateError } = await supabase
        .from('webhook_providers')
        .update({
          event_type_mapping: plainConfig,
          header_name: headerName,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', existingProvider.id)
        .eq('client_id', clientId);

      if (updateError) {
        console.error('[Integrations] Failed to update provider:', updateError.message);
        return NextResponse.json(
          { error: 'Failed to update provider' },
          { status: 500 }
        );
      }
      providerId = existingProvider.id;

      const { error: auditErr } = await supabase.from('audit_logs').insert({
        client_id: clientId,
        actor_type: 'user',
        actor_id: user.id,
        action: 'integration_updated',
        resource_type: 'integration',
        resource_id: existingProvider.id,
        metadata: { provider_name: providerName },
      });
      if (auditErr) console.error('[Audit] Failed to log integration update:', auditErr.message);
    } else {
      const { data: newProvider, error: createError } = await supabase
        .from('webhook_providers')
        .insert({
          client_id: clientId,
          provider_name: providerName,
          display_name: providerDef.label,
          status: 'active',
          auth_type: authType,
          secret_ref: `env:${providerName}_SECRET`,
          header_name: headerName,
          event_type_mapping: providerName === 'servicetitan'
            ? {
                EstimateUnbooked: 'estimate_unbooked',
                JobCompleted: 'job_completed',
                AppointmentCreated: 'appointment_created',
                AppointmentUpdated: 'appointment_updated',
                CustomerCreated: 'customer_created',
                EstimateCreated: 'estimate_created',
                EstimateUpdated: 'estimate_updated',
              }
            : {},
          tenant_resolution: { strategy: 'credential_based' },
          max_payload_size_bytes: 1048576,
        } as any)
        .select('id')
        .single();

      if (createError || !newProvider) {
        const errMsg = createError?.message || 'Unknown error';
        console.error('[Integrations] Failed to create provider:', errMsg);
        return NextResponse.json(
          { error: `Failed to create provider: ${errMsg}` },
          { status: 500 }
        );
      }
      providerId = newProvider.id;

      const { error: auditErr } = await supabase.from('audit_logs').insert({
        client_id: clientId,
        actor_type: 'user',
        actor_id: user.id,
        action: 'integration_created',
        resource_type: 'integration',
        resource_id: newProvider.id,
        metadata: { provider_name: providerName },
      });
      if (auditErr) console.error('[Audit] Failed to log integration creation:', auditErr.message);
    }

    const secretEntries = Object.entries(secrets);
    if (secretEntries.length > 0) {
      const { data: latestCred } = await supabase
        .from('webhook_credentials')
        .select('secret_version')
        .eq('provider_id', providerId)
        .order('secret_version', { ascending: false })
        .limit(1);

      const nextVersion = (latestCred?.[0]?.secret_version || 0) + 1;

      for (const [key, value] of secretEntries) {
        const credentialBytes = new TextEncoder().encode(value);
        const encrypted = await encryptSecret(credentialBytes);

        const { error: credError } = await supabase
          .from('webhook_credentials')
          .insert({
            provider_id: providerId,
            client_id: clientId,
            encrypted_secret: Buffer.from(encrypted).toString('base64'),
            secret_version: nextVersion,
            algorithm: 'aes-256-gcm',
          } as any);

        if (credError) {
          console.error(`[Integrations] Failed to store credential for ${key}:`, credError.message);
          return NextResponse.json(
            { error: 'Failed to store credential' },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      integration: {
        id: providerId,
        providerName,
        displayName: providerDef.label,
        status: 'active',
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Integrations:POST] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await verifyAuthOrCron(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    const clientId = await resolveClientId(supabase, user.id);

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('id');

    if (!providerId) {
      return NextResponse.json({ error: 'Provider ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('webhook_providers')
      .update({ status: 'revoked', updated_at: new Date().toISOString() } as any)
      .eq('id', providerId)
      .eq('client_id', clientId);

    if (error) {
      console.error('[Integrations] Failed to deactivate integration:', error.message);
      return NextResponse.json(
        { error: 'Failed to deactivate integration' },
        { status: 500 }
      );
    }

    const { error: auditErr } = await supabase.from('audit_logs').insert({
      client_id: clientId,
      actor_type: 'user',
      actor_id: user.id,
      action: 'integration_revoked',
      resource_type: 'integration',
      resource_id: providerId,
      metadata: { provider_id: providerId },
    });
    if (auditErr) console.error('[Audit] Failed to log integration revocation:', auditErr.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Integrations:DELETE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
