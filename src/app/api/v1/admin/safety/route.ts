import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyAuthOrCron } from '@/lib/auth';
import { resolveClientId } from '@/lib/admin-tenant';

export async function GET(req: NextRequest) {
  const user = await verifyAuthOrCron(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);

    const [consentsResult, optOutsResult, killSwitchResult, messagesResult] = await Promise.all([
      supabase
        .from('consents')
        .select('id, customer_id, type, status, source, granted_at, revoked_at, expires_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100)
        .then(r => ({ data: r.data ?? [], error: r.error })),
      supabase
        .from('opt_out_keywords')
        .select('id, keyword, channel, is_active, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .then(r => ({ data: r.data ?? [], error: r.error })),
      supabase
        .from('system_config')
        .select('value')
        .eq('key', 'global_kill_switch')
        .maybeSingle()
        .then(r => ({ data: r.data, error: r.error })),
      supabase
        .from('messages')
        .select('id, direction, channel, status, error_code, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(r => ({ data: r.data ?? [], error: r.error })),
    ]);

    if (consentsResult.error) console.warn('[Safety] Consents query error:', consentsResult.error.message);
    if (optOutsResult.error) console.warn('[Safety] Opt-outs query error:', optOutsResult.error.message);
    if (killSwitchResult.error) console.warn('[Safety] Kill switch query error:', killSwitchResult.error.message);
    if (messagesResult.error) console.warn('[Safety] Messages query error:', messagesResult.error.message);

    const optedOutCustomers = (consentsResult.data ?? [])
      .filter(c => c.status === 'revoked')
      .map(c => c.customer_id);
    const uniqueOptedOut = [...new Set(optedOutCustomers)];

    const outboundMessages = (messagesResult.data ?? []).filter(m => m.direction === 'outbound');
    const deliveredCount = outboundMessages.filter(m => m.status === 'delivered').length;
    const failedCount = outboundMessages.filter(m => m.status === 'failed').length;
    const pendingCount = outboundMessages.filter(m => m.status === 'pending' || m.status === 'sent').length;

    return NextResponse.json({
      consents: consentsResult.data ?? [],
      consentSummary: {
        granted: (consentsResult.data ?? []).filter(c => c.status === 'granted').length,
        revoked: (consentsResult.data ?? []).filter(c => c.status === 'revoked').length,
        pending: (consentsResult.data ?? []).filter(c => c.status === 'pending').length,
        unknown: (consentsResult.data ?? []).filter(c => c.status === 'unknown').length,
        total: (consentsResult.data ?? []).length,
      },
      optOutKeywords: optOutsResult.data ?? [],
      killSwitchActive: killSwitchResult.data?.value === 'true',
      optedOutCustomerIds: uniqueOptedOut,
      outboundSummary: {
        delivered: deliveredCount,
        failed: failedCount,
        pending: pendingCount,
        total: outboundMessages.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Safety] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
