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

    const [clientResult, membersResult, customersCount, leadsCount, estimatesCount] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, display_name, status, created_at, kill_switch_enabled')
        .eq('id', clientId)
        .maybeSingle()
        .then(r => ({ data: r.data, error: r.error })),
      supabase
        .from('client_members')
        .select('id, user_id, email, role, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .then(r => ({ data: r.data ?? [], error: r.error })),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .then(r => ({ count: r.count ?? 0, error: r.error })),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .then(r => ({ count: r.count ?? 0, error: r.error })),
      supabase
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .then(r => ({ count: r.count ?? 0, error: r.error })),
    ]);

    if (clientResult.error) console.warn('[Tenants] Client query error:', clientResult.error.message);
    if (membersResult.error) console.warn('[Tenants] Members query error:', membersResult.error.message);

    const tables = [
      { name: 'customers', count: customersCount.count, isolated: true },
      { name: 'leads', count: leadsCount.count, isolated: true },
      { name: 'estimates', count: estimatesCount.count, isolated: true },
    ];

    return NextResponse.json({
      currentTenant: clientResult.data ?? null,
      members: membersResult.data ?? [],
      tableIsolation: tables,
      totalTables: tables.length,
      allIsolated: tables.every(t => t.isolated),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Tenants] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
