import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateProviderConfig } from '@/lib/webhook/validate-schema';
import { resolveTenantFromProvider, validateTenantConsistency } from '@/lib/webhook/resolve-tenant';
import { computeIdempotencyKey, checkAndReserveIdempotency } from '@/lib/webhook/idempotency';
import { validateTimestamp, createReplayConfig } from '@/lib/webhook/replay';
import { persistIngestionEvent, logProcessingStage } from '@/lib/webhook/persistence';
import { ServiceTitanAdapter } from '@/lib/webhook/adapters/servicetitan';
import { validateServiceTitanPayload } from '@/lib/webhook/servicetitan-schema';
import { mapErrorToResponse, WebhookErrorCode, createError } from '@/lib/webhook/errors';
import { checkHttpRateLimit } from '@/lib/safety/resilience/http-rate-limiter';

const MAX_PAYLOAD_SIZE = 1024 * 1024;

const SERVICETITAN_EVENT_TYPE_MAP: Record<string, string> = {
  'EstimateUnbooked': 'estimate_unbooked',
  'JobCompleted': 'job_completed',
  'AppointmentCreated': 'appointment_created',
  'AppointmentUpdated': 'appointment_updated',
  'CustomerCreated': 'customer_created',
  'EstimateCreated': 'estimate_created',
  'EstimateUpdated': 'estimate_updated',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider_name: string }> }
) {
  const startTime = Date.now();
  let supabase: any;
  let providerConfig: any;
  let ingestionEventId: string | undefined;

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
  const rl = checkHttpRateLimit(`servicetitan:${ip}`, { windowMs: 60000, maxRequests: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  try {
    supabase = createAdminClient();

    const rawBody = await request.arrayBuffer();
    const bodyBytes = new Uint8Array(rawBody);

    if (bodyBytes.length > MAX_PAYLOAD_SIZE) {
      const { status, body } = mapErrorToResponse(
        createError(WebhookErrorCode.PAYLOAD_TOO_LARGE, 'Payload too large', 'Payload too large')
      );
      return NextResponse.json(body, { status });
    }

    const { data: provider, error: providerError } = await supabase
      .from('webhook_providers')
      .select('*')
      .eq('provider_name', 'servicetitan')
      .eq('status', 'active')
      .single();

    if (providerError || !provider) {
      const { status, body } = mapErrorToResponse(
        createError(WebhookErrorCode.UNSUPPORTED_PROVIDER, 'ServiceTitan provider not configured', 'Provider not found')
      );
      return NextResponse.json(body, { status });
    }

    providerConfig = validateProviderConfig({
      provider_name: provider.provider_name,
      auth_type: provider.auth_type,
      event_type_mapping: provider.event_type_mapping || SERVICETITAN_EVENT_TYPE_MAP,
      tenant_resolution: provider.tenant_resolution,
      max_payload_size_bytes: provider.max_payload_size_bytes,
      header_name: provider.header_name,
    });

    const maxSize = Math.min(providerConfig.maxPayloadSizeBytes, MAX_PAYLOAD_SIZE);
    if (bodyBytes.length > maxSize) {
      const { status, body } = mapErrorToResponse(
        createError(WebhookErrorCode.PAYLOAD_TOO_LARGE, 'Payload too large', 'Payload too large')
      );
      return NextResponse.json(body, { status });
    }

    const { data: credential, error: credentialError } = await supabase
      .rpc('get_webhook_credential_secret', { p_provider_id: provider.id });

    if (credentialError || !credential) {
      const { status, body } = mapErrorToResponse(
        createError(WebhookErrorCode.INVALID_CREDENTIALS, 'No valid credential', 'Invalid credentials')
      );
      return NextResponse.json(body, { status });
    }

    const encryptedSecret = new Uint8Array(credential as unknown as ArrayBuffer);

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const adapter = new ServiceTitanAdapter({
      signatureHeader: providerConfig.headerName || 'x-st-webhook-signature',
    });

    await logProcessingStage(supabase, '', provider.client_id, 'signature_verify', 'started');
    const verifyStart = Date.now();
    const verification = await adapter.verify(bodyBytes, headers, encryptedSecret);
    await logProcessingStage(
      supabase,
      '',
      provider.client_id,
      'signature_verify',
      verification.valid ? 'success' : 'failed',
      verification.error?.message,
      Date.now() - verifyStart
    );

    if (!verification.valid) {
      const { status, body } = mapErrorToResponse(verification.error!);
      return NextResponse.json(body, { status });
    }

    await logProcessingStage(supabase, '', provider.client_id, 'schema_validate', 'started');
    const schemaStart = Date.now();
    const validated = validateServiceTitanPayload(bodyBytes);
    await logProcessingStage(supabase, '', provider.client_id, 'schema_validate', 'success', undefined, Date.now() - schemaStart);

    const internalEventType = providerConfig.eventTypeMapping[validated.eventType] || validated.eventType;

    await logProcessingStage(supabase, '', provider.client_id, 'tenant_resolve', 'started');
    const tenantStart = Date.now();
    const resolvedTenant = await resolveTenantFromProvider(
      {
        id: provider.id,
        clientId: provider.client_id,
        providerName: provider.provider_name,
        authType: provider.auth_type,
        headerName: provider.header_name,
        eventTypeMapping: provider.event_type_mapping,
        tenantResolution: provider.tenant_resolution,
        maxPayloadSizeBytes: provider.max_payload_size_bytes,
      },
      bodyBytes
    );
    await logProcessingStage(supabase, '', provider.client_id, 'tenant_resolve', 'success', undefined, Date.now() - tenantStart);

    validateTenantConsistency(resolvedTenant.clientId, undefined, headers);

    await logProcessingStage(supabase, '', provider.client_id, 'duplicate_check', 'started');
    const idempotencyStart = Date.now();
    const idempotencyKey = computeIdempotencyKey({
      providerId: provider.id,
      externalEventId: validated.correlationId,
      providerTimestamp: validated.timestamp,
    });

    const idempotencyResult = await checkAndReserveIdempotency(
      supabase,
      resolvedTenant.clientId,
      resolvedTenant.providerId,
      idempotencyKey
    );
    await logProcessingStage(
      supabase,
      idempotencyResult.ingestionEventId || '',
      resolvedTenant.clientId,
      'duplicate_check',
      idempotencyResult.isDuplicate ? 'success' : 'started',
      undefined,
      Date.now() - idempotencyStart
    );

    if (idempotencyResult.isDuplicate) {
      return NextResponse.json(
        {
          ingestion_event_id: idempotencyResult.ingestionEventId,
          duplicate: true,
        },
        { status: 202 }
      );
    }

    await logProcessingStage(supabase, '', provider.client_id, 'replay_check', 'started');
    const replayStart = Date.now();
    const replayConfig = createReplayConfig({
      replay_protection_enabled: true,
      max_age_seconds: 300,
      max_future_seconds: 60,
    });
    const replayResult = validateTimestamp(validated.timestamp, replayConfig);
    await logProcessingStage(
      supabase,
      '',
      resolvedTenant.clientId,
      'replay_check',
      replayResult.valid ? 'success' : 'failed',
      replayResult.error?.message,
      Date.now() - replayStart
    );

    if (!replayResult.valid) {
      const { status, body } = mapErrorToResponse(replayResult.error!);
      return NextResponse.json(body, { status });
    }

    await logProcessingStage(supabase, '', resolvedTenant.clientId, 'persist', 'started');
    const persistStart = Date.now();
    const persistResult = await persistIngestionEvent(supabase, {
      clientId: resolvedTenant.clientId,
      providerId: resolvedTenant.providerId,
      externalEventId: validated.correlationId,
      providerEventType: validated.eventType,
      internalEventType,
      rawPayload: validated.data,
      rawHeaders: headers,
      idempotencyKey: idempotencyResult.idempotencyKey,
      providerEventTimestamp: validated.timestamp,
      metadata: {
        provider_name: 'servicetitan',
        received_at: new Date().toISOString(),
      },
    });
    await logProcessingStage(
      supabase,
      persistResult.id,
      resolvedTenant.clientId,
      'persist',
      persistResult.isDuplicate ? 'success' : 'started',
      undefined,
      Date.now() - persistStart
    );

    ingestionEventId = persistResult.id;

    await logProcessingStage(supabase, ingestionEventId, resolvedTenant.clientId, 'complete', 'success', undefined, Date.now() - startTime);

    return NextResponse.json(
      {
        ingestion_event_id: ingestionEventId,
        duplicate: persistResult.isDuplicate,
      },
      { status: 202 }
    );
  } catch (error) {
    const { status, body } = mapErrorToResponse(error);

    if (ingestionEventId && supabase) {
      await logProcessingStage(supabase, ingestionEventId, providerConfig?.client_id || '', 'complete', 'failed', error instanceof Error ? error.message : 'Unknown error', Date.now() - startTime);
    }

    return NextResponse.json(body, { status });
  }
}
