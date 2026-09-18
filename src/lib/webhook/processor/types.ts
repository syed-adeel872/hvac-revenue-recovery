export interface ClaimedEvent {
  id: string;
  clientId: string;
  providerId: string;
  providerName: string;
  externalEventId: string;
  providerEventType: string;
  internalEventType: string | null;
  rawPayload: Record<string, unknown>;
  rawHeaders: Record<string, string>;
  idempotencyKey: string;
  providerEventTimestamp: string | null;
  receivedAt: string;
  status: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}

export interface MapResult {
  eventType: string;
  eventSource: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface WorkflowEventResult {
  id: string;
  isDuplicate: boolean;
}

export interface ProcessResult {
  success: boolean;
  error?: string;
  workflowEventId?: string;
  shouldRetry?: boolean;
}

export interface ProcessorConfig {
  batchSize: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  pollIntervalMs: number;
  tenantId?: string;
}

export const DEFAULT_PROCESSOR_CONFIG: ProcessorConfig = {
  batchSize: 10,
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 300000,
  pollIntervalMs: 5000,
};

export type IngestionStatus =
  | 'received'
  | 'processing'
  | 'mapped'
  | 'workflow_created'
  | 'completed'
  | 'failed'
  | 'retryable_failed';

export const VALID_TRANSITIONS: Record<IngestionStatus, IngestionStatus[]> = {
  received: ['processing'],
  processing: ['mapped', 'retryable_failed'],
  mapped: ['workflow_created', 'retryable_failed'],
  workflow_created: ['completed', 'retryable_failed'],
  retryable_failed: ['processing', 'failed'],
  completed: [],
  failed: [],
};

export interface ProcessingStageLog {
  ingestionEventId: string;
  clientId: string;
  stage: string;
  status: 'started' | 'success' | 'failed' | 'retry';
  errorMessage?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}