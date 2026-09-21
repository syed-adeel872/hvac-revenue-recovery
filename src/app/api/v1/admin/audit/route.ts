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

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
    const offset = (page - 1) * pageSize;
    const resourceType = url.searchParams.get('resourceType');
    const actorType = url.searchParams.get('actorType');

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }
    if (actorType) {
      query = query.eq('actor_type', actorType);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('[Audit] Query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logs: logs ?? [],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Audit] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
