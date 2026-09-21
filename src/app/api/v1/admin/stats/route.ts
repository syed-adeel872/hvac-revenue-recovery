import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyAuthOrCron } from '@/lib/auth';
import { resolveClientId } from '@/lib/admin-tenant';

async function safeCount(supabase: ReturnType<typeof createAdminClient>, table: string, filters: Record<string, unknown> = {}): Promise<number> {
  try {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(filters)) {
      if (value === null) {
        query = query.is(key, null);
      } else if (typeof value === 'boolean') {
        query = query.eq(key, value);
      } else {
        query = query.eq(key, value);
      }
    }
    const { count, error } = await query;
    if (error) {
      console.warn(`[Stats] Query failed for table ${table}:`, error.message);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.warn(`[Stats] Exception querying table ${table}:`, err instanceof Error ? err.message : 'Unknown');
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const user = await verifyAuthOrCron(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);

    const [
      totalCustomers,
      totalLeads,
      totalEstimates,
      pendingActions,
      completedActions,
      failedActions,
      activeWorkflows,
      totalBookings,
      totalErrors,
    ] = await Promise.all([
      safeCount(supabase, 'customers', { client_id: clientId }),
      safeCount(supabase, 'leads', { client_id: clientId }),
      safeCount(supabase, 'estimates', { client_id: clientId }),
      safeCount(supabase, 'actions', { client_id: clientId, status: 'pending' }),
      safeCount(supabase, 'actions', { client_id: clientId, status: 'completed' }),
      safeCount(supabase, 'actions', { client_id: clientId, status: 'failed' }),
      safeCount(supabase, 'workflow_events', { client_id: clientId, processed: false }),
      safeCount(supabase, 'bookings', { client_id: clientId }),
      safeCount(supabase, 'errors', { client_id: clientId, resolved: false }),
    ]);

    const totalActions = pendingActions + completedActions + failedActions;
    const recoveryRate = totalActions > 0
      ? Math.round((completedActions / totalActions) * 1000) / 10
      : 0;

    return NextResponse.json({
      customers: totalCustomers,
      leads: totalLeads,
      estimates: totalEstimates,
      pendingActions,
      completedActions,
      failedActions,
      recoveryRate,
      activeWorkflows,
      bookings: totalBookings,
      unresolvedErrors: totalErrors,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stats] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
