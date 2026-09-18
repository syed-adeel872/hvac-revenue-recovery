import { SupabaseClient } from '@supabase/supabase-js';
import {
  OperationsMetricsOptions,
  MetricsResult,
  EventMetrics,
  ActionMetrics,
  ErrorMetrics,
} from './types';

function buildEmptyMetrics(clientId: string, periodStart: string, periodEnd: string): MetricsResult {
  return {
    clientId,
    periodStart,
    periodEnd,
    events: {
      total: 0,
      received: 0,
      processing: 0,
      mapped: 0,
      workflowCreated: 0,
      completed: 0,
      failed: 0,
      retryableFailed: 0,
    },
    actions: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      executing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      expired: 0,
    },
    errors: {
      total: 0,
      unresolved: 0,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
    },
  };
}

async function countByStatus(
  supabase: SupabaseClient,
  table: string,
  clientId: string,
  statuses: string[],
  periodStart: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', status)
      .gte('created_at', periodStart);
    counts[status] = count ?? 0;
  }
  return counts;
}

async function collectEventMetrics(
  supabase: SupabaseClient,
  clientId: string,
  periodStart: string,
): Promise<EventMetrics> {
  const statuses = [
    'received',
    'processing',
    'mapped',
    'workflow_created',
    'completed',
    'failed',
    'retryable_failed',
  ];

  const counts = await countByStatus(supabase, 'ingestion_events', clientId, statuses, periodStart);
  const total = statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return {
    total,
    received: counts['received'] ?? 0,
    processing: counts['processing'] ?? 0,
    mapped: counts['mapped'] ?? 0,
    workflowCreated: counts['workflow_created'] ?? 0,
    completed: counts['completed'] ?? 0,
    failed: counts['failed'] ?? 0,
    retryableFailed: counts['retryable_failed'] ?? 0,
  };
}

async function collectActionMetrics(
  supabase: SupabaseClient,
  clientId: string,
  periodStart: string,
): Promise<ActionMetrics> {
  const statuses = [
    'pending',
    'approved',
    'rejected',
    'executing',
    'completed',
    'failed',
    'cancelled',
    'expired',
  ];

  const counts = await countByStatus(supabase, 'actions', clientId, statuses, periodStart);
  const total = statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return {
    total,
    pending: counts['pending'] ?? 0,
    approved: counts['approved'] ?? 0,
    rejected: counts['rejected'] ?? 0,
    executing: counts['executing'] ?? 0,
    completed: counts['completed'] ?? 0,
    failed: counts['failed'] ?? 0,
    cancelled: counts['cancelled'] ?? 0,
    expired: counts['expired'] ?? 0,
  };
}

async function collectErrorMetrics(
  supabase: SupabaseClient,
  clientId: string,
  periodStart: string,
): Promise<ErrorMetrics> {
  const { count: total } = await supabase
    .from('errors')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', periodStart);

  const { count: unresolved } = await supabase
    .from('errors')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('resolved', false)
    .gte('created_at', periodStart);

  const severityCounts: ErrorMetrics['bySeverity'] = { low: 0, medium: 0, high: 0, critical: 0 };
  const severities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

  for (const severity of severities) {
    const { count } = await supabase
      .from('errors')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('severity', severity)
      .eq('resolved', false)
      .gte('created_at', periodStart);
    severityCounts[severity] = count ?? 0;
  }

  return {
    total: total ?? 0,
    unresolved: unresolved ?? 0,
    bySeverity: severityCounts,
  };
}

export async function collectMetrics(
  supabase: SupabaseClient,
  options: OperationsMetricsOptions,
): Promise<MetricsResult> {
  const { clientId, periodHours = 24 } = options;
  const periodEnd = new Date().toISOString();
  const periodStart = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

  const metrics = buildEmptyMetrics(clientId, periodStart, periodEnd);

  const [eventMetrics, actionMetrics, errorMetrics] = await Promise.all([
    collectEventMetrics(supabase, clientId, periodStart),
    collectActionMetrics(supabase, clientId, periodStart),
    collectErrorMetrics(supabase, clientId, periodStart),
  ]);

  metrics.events = eventMetrics;
  metrics.actions = actionMetrics;
  metrics.errors = errorMetrics;

  return metrics;
}
