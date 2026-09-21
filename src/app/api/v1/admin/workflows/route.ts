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

    const [
      { data: unprocessedEvents },
      { data: failedEvents },
      { data: pendingActions },
      { data: completedActions },
      { data: failedActions },
      { data: circuitBreakers },
      { count: killSwitchStatus },
    ] = await Promise.all([
      supabase
        .from('workflow_events')
        .select('id', { count: 'exact' })
        .eq('client_id', clientId)
        .eq('processed', false),
      supabase
        .from('workflow_events')
        .select('id', { count: 'exact' })
        .eq('client_id', clientId)
        .not('processing_error', 'is', null),
      supabase
        .from('actions')
        .select('worker_type', { count: 'exact' })
        .eq('client_id', clientId)
        .eq('status', 'pending'),
      supabase
        .from('actions')
        .select('worker_type', { count: 'exact' })
        .eq('client_id', clientId)
        .eq('status', 'completed'),
      supabase
        .from('actions')
        .select('worker_type', { count: 'exact' })
        .eq('client_id', clientId)
        .eq('status', 'failed'),
      supabase
        .from('circuit_breaker_state')
        .select('client_id, state, failure_count, last_failure_time')
        .eq('client_id', clientId),
      supabase
        .from('system_config')
        .select('*', { count: 'exact', head: true })
        .eq('key', 'global_kill_switch')
        .eq('value', 'true'),
    ]);

    const workerTypes = ['intelligence', 'recovery', 'safety', 'operations'] as const;
    const pipelineStages = workerTypes.map((workerType) => {
      const pending = (pendingActions || []).filter((a) => a.worker_type === workerType).length;
      const completed = (completedActions || []).filter((a) => a.worker_type === workerType).length;
      const failed = (failedActions || []).filter((a) => a.worker_type === workerType).length;
      const total = pending + completed + failed;

      return {
        name: workerType.charAt(0).toUpperCase() + workerType.slice(1),
        workerType,
        pending,
        completed,
        failed,
        total,
        health: total === 0 ? 'idle' : failed === 0 ? 'healthy' : failed / total > 0.3 ? 'degraded' : 'healthy',
      };
    });

    const globalKillSwitchActive = (killSwitchStatus || 0) > 0;

    return NextResponse.json({
      pipelineStages,
      unprocessedEvents: unprocessedEvents?.length || 0,
      failedEvents: failedEvents?.length || 0,
      circuitBreakers: circuitBreakers || [],
      globalKillSwitchActive,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Workflows] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
