import { SupabaseClient } from '@supabase/supabase-js';
import { AnomalyDetectionOptions, AnomalyResult } from './types';

const DEFAULT_STUCK_THRESHOLD_MINUTES = 15;
const DEFAULT_HIGH_ERROR_THRESHOLD = 10;
const DEFAULT_EXCESSIVE_RETRY_THRESHOLD = 3;

function getStuckCutoff(thresholdMinutes: number): string {
  return new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
}

export async function detectStuckIngestionEvents(
  supabase: SupabaseClient,
  options: AnomalyDetectionOptions,
): Promise<AnomalyResult[]> {
  const thresholdMinutes = options.stuckThresholdMinutes ?? DEFAULT_STUCK_THRESHOLD_MINUTES;
  const cutoff = getStuckCutoff(thresholdMinutes);

  const { data, error } = await supabase
    .from('ingestion_events')
    .select('id')
    .eq('client_id', options.clientId)
    .eq('status', 'processing')
    .lt('processing_started_at', cutoff);

  if (error) {
    throw new Error(`Failed to detect stuck ingestion events: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return [
    {
      type: 'stuck_ingestion_event',
      severity: data.length > 5 ? 'high' : 'medium',
      description: `${data.length} ingestion event(s) stuck in 'processing' for > ${thresholdMinutes} minutes`,
      affectedEntityIds: data.map((row) => row.id),
      detectedAt: new Date().toISOString(),
    },
  ];
}

export async function detectStuckActions(
  supabase: SupabaseClient,
  options: AnomalyDetectionOptions,
): Promise<AnomalyResult[]> {
  const thresholdMinutes = options.stuckThresholdMinutes ?? DEFAULT_STUCK_THRESHOLD_MINUTES;
  const cutoff = getStuckCutoff(thresholdMinutes);

  const { data, error } = await supabase
    .from('actions')
    .select('id')
    .eq('client_id', options.clientId)
    .eq('status', 'executing')
    .lt('started_at', cutoff);

  if (error) {
    throw new Error(`Failed to detect stuck actions: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return [
    {
      type: 'stuck_action',
      severity: data.length > 5 ? 'high' : 'medium',
      description: `${data.length} action(s) stuck in 'executing' for > ${thresholdMinutes} minutes`,
      affectedEntityIds: data.map((row) => row.id),
      detectedAt: new Date().toISOString(),
    },
  ];
}

export async function detectExcessiveRetries(
  supabase: SupabaseClient,
  options: AnomalyDetectionOptions,
): Promise<AnomalyResult[]> {
  const threshold = options.excessiveRetryThreshold ?? DEFAULT_EXCESSIVE_RETRY_THRESHOLD;

  const { data: events, error: eventsError } = await supabase
    .from('ingestion_events')
    .select('id')
    .eq('client_id', options.clientId)
    .gte('retry_count', threshold)
    .in('status', ['received', 'retryable_failed']);

  if (eventsError) {
    throw new Error(`Failed to detect excessive event retries: ${eventsError.message}`);
  }

  const { data: workflowEvents, error: workflowError } = await supabase
    .from('workflow_events')
    .select('id')
    .eq('client_id', options.clientId)
    .gte('retry_count', threshold)
    .eq('processed', false);

  if (workflowError) {
    throw new Error(`Failed to detect excessive workflow retries: ${workflowError.message}`);
  }

  const allIds = [
    ...(events ?? []).map((r) => r.id),
    ...(workflowEvents ?? []).map((r) => r.id),
  ];

  if (allIds.length === 0) return [];

  return [
    {
      type: 'excessive_retries',
      severity: allIds.length > 3 ? 'high' : 'medium',
      description: `${allIds.length} event(s) with retry count >= ${threshold}`,
      affectedEntityIds: allIds,
      detectedAt: new Date().toISOString(),
    },
  ];
}

export async function detectHighErrorRate(
  supabase: SupabaseClient,
  options: AnomalyDetectionOptions,
): Promise<AnomalyResult[]> {
  const threshold = options.highErrorThreshold ?? DEFAULT_HIGH_ERROR_THRESHOLD;
  const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('errors')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', options.clientId)
    .eq('resolved', false)
    .gte('created_at', periodStart);

  if (error) {
    throw new Error(`Failed to detect high error rate: ${error.message}`);
  }

  const unresolvedCount = count ?? 0;
  if (unresolvedCount < threshold) return [];

  return [
    {
      type: 'high_error_rate',
      severity: unresolvedCount >= threshold * 2 ? 'critical' : 'high',
      description: `${unresolvedCount} unresolved error(s) in the last 24 hours (threshold: ${threshold})`,
      affectedEntityIds: [],
      detectedAt: new Date().toISOString(),
    },
  ];
}

export async function detectTenantDisabled(
  supabase: SupabaseClient,
  options: AnomalyDetectionOptions,
): Promise<AnomalyResult[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, status')
    .eq('id', options.clientId)
    .single();

  if (error) {
    throw new Error(`Failed to check tenant status: ${error.message}`);
  }

  if (!data || data.status === 'active') return [];

  return [
    {
      type: 'tenant_disabled',
      severity: 'critical',
      description: `Tenant is in '${data.status}' status`,
      affectedEntityIds: [data.id],
      detectedAt: new Date().toISOString(),
    },
  ];
}

export async function detectAllAnomalies(
  supabase: SupabaseClient,
  options: AnomalyDetectionOptions,
): Promise<AnomalyResult[]> {
  const results = await Promise.allSettled([
    detectTenantDisabled(supabase, options),
    detectStuckIngestionEvents(supabase, options),
    detectStuckActions(supabase, options),
    detectExcessiveRetries(supabase, options),
    detectHighErrorRate(supabase, options),
  ]);

  const anomalies: AnomalyResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      anomalies.push(...result.value);
    }
  }
  return anomalies;
}
