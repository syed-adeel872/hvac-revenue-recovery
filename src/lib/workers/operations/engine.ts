import { SupabaseClient } from '@supabase/supabase-js';
import { collectMetrics } from './metrics';
import { detectAllAnomalies } from './anomaly-detector';
import {
  OperationsResult,
  AnomalyDetectionOptions,
  ProcessBatchResult,
} from './types';

export interface RunOperationsOptions extends AnomalyDetectionOptions {
  periodHours?: number;
}

export async function runOperations(
  supabase: SupabaseClient,
  options: RunOperationsOptions,
): Promise<OperationsResult> {
  const executedAt = new Date().toISOString();

  const [metrics, anomalies] = await Promise.all([
    collectMetrics(supabase, {
      clientId: options.clientId,
      periodHours: options.periodHours,
    }),
    detectAllAnomalies(supabase, options),
  ]);

  const auditEntry = {
    clientId: options.clientId,
    action: 'operations_check',
    resourceType: 'system',
    resourceId: options.clientId,
    metadata: {
      executedAt,
      metricsSummary: {
        eventsTotal: metrics.events.total,
        actionsTotal: metrics.actions.total,
        errorsUnresolved: metrics.errors.unresolved,
      },
      anomaliesDetected: anomalies.length,
      anomalyTypes: anomalies.map((a) => a.type),
    },
  };

  const { error: auditError } = await supabase.from('audit_logs').insert({
    client_id: options.clientId,
    actor_type: 'worker',
    action: auditEntry.action,
    resource_type: auditEntry.resourceType,
    resource_id: auditEntry.resourceId,
    metadata: auditEntry.metadata,
  });

  if (auditError) {
    throw new Error(`Failed to write audit log: ${auditError.message}`);
  }

  return {
    clientId: options.clientId,
    metrics,
    anomalies,
    auditEntry,
    executedAt,
  };
}

export async function processBatch(
  supabase: SupabaseClient,
  clientIds: string[],
  options: Omit<AnomalyDetectionOptions, 'clientId'> = {},
): Promise<ProcessBatchResult> {
  const results: OperationsResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const clientId of clientIds) {
    try {
      const result = await runOperations(supabase, {
        clientId,
        stuckThresholdMinutes: options.stuckThresholdMinutes,
        highErrorThreshold: options.highErrorThreshold,
        excessiveRetryThreshold: options.excessiveRetryThreshold,
      });
      results.push(result);
      succeeded++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown operations error';
      results.push({
        clientId,
        metrics: {
          clientId,
          periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
          events: { total: 0, received: 0, processing: 0, mapped: 0, workflowCreated: 0, completed: 0, failed: 0, retryableFailed: 0 },
          actions: { total: 0, pending: 0, approved: 0, rejected: 0, executing: 0, completed: 0, failed: 0, cancelled: 0, expired: 0 },
          errors: { total: 0, unresolved: 0, bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } },
        },
        anomalies: [{
          type: 'operations_failure',
          severity: 'high',
          description: errorMsg,
          affectedEntityIds: [],
          detectedAt: new Date().toISOString(),
        }],
        auditEntry: { clientId, action: 'operations_check_failed', resourceType: 'system', resourceId: clientId, metadata: { error: errorMsg } },
        executedAt: new Date().toISOString(),
      });
      failed++;
    }
  }

  return {
    total: clientIds.length,
    succeeded,
    failed,
    results,
  };
}
