import { Json } from '@/lib/supabase/types';

export interface OperationsMetricsOptions {
  clientId: string;
  periodHours?: number;
}

export interface EventMetrics {
  total: number;
  received: number;
  processing: number;
  mapped: number;
  workflowCreated: number;
  completed: number;
  failed: number;
  retryableFailed: number;
}

export interface ActionMetrics {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executing: number;
  completed: number;
  failed: number;
  cancelled: number;
  expired: number;
}

export interface ErrorMetrics {
  total: number;
  unresolved: number;
  bySeverity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface MetricsResult {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  events: EventMetrics;
  actions: ActionMetrics;
  errors: ErrorMetrics;
}

export interface AnomalyDetectionOptions {
  clientId: string;
  stuckThresholdMinutes?: number;
  highErrorThreshold?: number;
  excessiveRetryThreshold?: number;
}

export type AnomalyType =
  | 'stuck_ingestion_event'
  | 'stuck_action'
  | 'excessive_retries'
  | 'high_error_rate'
  | 'tenant_disabled'
  | 'operations_failure';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyResult {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  affectedEntityIds: string[];
  detectedAt: string;
}

export interface AuditEntry {
  clientId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Json | null;
}

export interface OperationsResult {
  clientId: string;
  metrics: MetricsResult;
  anomalies: AnomalyResult[];
  auditEntry: AuditEntry;
  executedAt: string;
}

export interface ProcessBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: OperationsResult[];
}
