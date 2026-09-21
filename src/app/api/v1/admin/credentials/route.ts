import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthOrCron } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/webhook/encryption';
import { resolveClientId } from '@/lib/admin-tenant';
import { z } from 'zod';

const CredentialCreateSchema = z.object({
  provider: z.string().min(1).max(100),
  credentialType: z.enum(['api_key', 'oauth_token', 'webhook_secret', 'access_token']),
  credentialValue: z.string().min(1),
  label: z.string().min(1).max(200).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const user = await verifyAuthOrCron(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    let query = supabase
      .from('webhook_endpoints')
      .select('id, client_id, provider_name, is_active, created_at')
      .eq('client_id', clientId);

    if (provider) {
      query = query.eq('provider_name', provider);
    }

    const { data: endpoints, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
    }

    return NextResponse.json({
      credentials: (endpoints || []).map((ep: any) => ({
        id: ep.id,
        provider: ep.provider_name,
        isActive: ep.is_active,
        createdAt: ep.created_at,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Credentials:GET] Error:', message);
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
    const clientId = await resolveClientId(supabase, user.id);
    const body = await request.json();
    const parsed = CredentialCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { provider, credentialType, credentialValue, label, expiresAt, metadata } = parsed.data;

    const credentialBytes = new TextEncoder().encode(credentialValue);
    const encrypted = await encryptSecret(credentialBytes);
    const encryptedHex = Buffer.from(encrypted).toString('hex');

    const { data: endpoint, error } = await supabase
      .from('webhook_endpoints')
      .insert({
        client_id: clientId,
        provider_name: provider,
        webhook_url: `https://app.internal/api/v1/webhooks/${provider}`,
        webhook_secret_encrypted: encryptedHex,
        is_active: true,
        config: {
          credentialType,
          label: label || `${provider} ${credentialType}`,
          expiresAt: expiresAt || null,
          metadata: metadata || {},
          rotatedAt: new Date().toISOString(),
        },
      } as any)
      .select('id, provider_name, is_active, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to store credential' }, { status: 500 });
    }

    return NextResponse.json({
      credential: {
        id: endpoint.id,
        provider: endpoint.provider_name,
        isActive: endpoint.is_active,
        createdAt: endpoint.created_at,
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Credentials:POST] Error:', message);
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
    const credentialId = searchParams.get('id');

    if (!credentialId) {
      return NextResponse.json({ error: 'Credential ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('webhook_endpoints')
      .update({ is_active: false } as any)
      .eq('id', credentialId)
      .eq('client_id', clientId);

    if (error) {
      return NextResponse.json({ error: 'Failed to deactivate credential' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Credentials:DELETE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
