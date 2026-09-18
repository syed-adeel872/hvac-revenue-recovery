import { ClaimedEvent, ProcessResult, MapResult, WorkflowEventResult, ProcessingStageLog } from './types';
import { mapEventToWorkflow } from './map-event';
import { createWorkflowEvent } from './create-workflow-event';
import { logProcessingStage } from '../persistence';
import { createError, WebhookErrorCode } from '../errors';

export interface ProcessEventOptions {
  supabase: any;
  event: ClaimedEvent;
  maxRetries: number;
}

async function updateEventStatus(
  supabase: any,
  eventId: string,
  clientId: string,
  status: string,
  errorMessage?: string,
  extraFields?: Record<string, any>
): Promise<void> {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
    ...extraFields,
  };

  if (status === 'processing') {
    updates.processing_started_at = new Date().toISOString();
  } else if (status === 'completed') {
    updates.processing_completed_at = new Date().toISOString();
  }

  if (errorMessage) {
    updates.last_error = errorMessage;
    updates.last_error_at = new Date().toISOString();
  }

  if (status === 'retryable_failed' || status === 'failed') {
    const { data: current } = await supabase
      .from('ingestion_events')
      .select('retry_count')
      .eq('id', eventId)
      .eq('client_id', clientId)
      .single();

    if (current) {
      updates.retry_count = current.retry_count + 1;
    }
  }

  const { error } = await supabase
    .from('ingestion_events')
    .update(updates)
    .eq('id', eventId)
    .eq('client_id', clientId);

  if (error) {
    throw new Error(`Failed to update event status to ${status}: ${error.message}`);
  }
}

async function logStage(
  supabase: any,
  eventId: string,
  clientId: string,
  stage: ProcessingStageLog['stage'],
  status: ProcessingStageLog['status'],
  errorMessage?: string,
  durationMs?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logProcessingStage(supabase, eventId, clientId, stage, status, errorMessage, durationMs, metadata);
}

export async function processEvent(options: ProcessEventOptions): Promise<ProcessResult> {
  const { supabase, event, maxRetries } = options;
  const startTime = Date.now();

  try {
    await logStage(supabase, event.id, event.clientId, 'event_map', 'started');

    let mapResult: MapResult;
    try {
      mapResult = mapEventToWorkflow(event);
      await logStage(supabase, event.id, event.clientId, 'event_map', 'success', undefined, Date.now() - startTime);
    } catch (mapError) {
      const msg = mapError instanceof Error ? mapError.message : 'Mapping failed';
      await logStage(supabase, event.id, event.clientId, 'event_map', 'failed', msg, Date.now() - startTime);
      throw mapError;
    }

    await updateEventStatus(supabase, event.id, event.clientId, 'mapped');

    await logStage(supabase, event.id, event.clientId, 'workflow_create', 'started');

    let workflowResult: WorkflowEventResult;
    try {
      workflowResult = await createWorkflowEvent({
        supabase,
        clientId: event.clientId,
        idempotencyKey: event.idempotencyKey,
        mapResult,
      });
      await logStage(
        supabase,
        event.id,
        event.clientId,
        'workflow_create',
        'success',
        undefined,
        Date.now() - startTime,
        { workflow_event_id: workflowResult.id }
      );
    } catch (workflowError) {
      const msg = workflowError instanceof Error ? workflowError.message : 'Workflow creation failed';
      await logStage(supabase, event.id, event.clientId, 'workflow_create', 'failed', msg, Date.now() - startTime);
      throw workflowError;
    }

    await updateEventStatus(supabase, event.id, event.clientId, 'workflow_created', undefined, {
      correlation_id: workflowResult.id,
    });

    await updateEventStatus(supabase, event.id, event.clientId, 'completed');

    await logStage(supabase, event.id, event.clientId, 'complete', 'success', undefined, Date.now() - startTime);

    return {
      success: true,
      workflowEventId: workflowResult.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTransient = isTransientError(error);

    if (isTransient && event.retryCount < maxRetries) {
      await updateEventStatus(supabase, event.id, event.clientId, 'retryable_failed', errorMessage);

      return {
        success: false,
        error: errorMessage,
        shouldRetry: true,
      };
    } else {
      await updateEventStatus(supabase, event.id, event.clientId, 'failed', errorMessage);

      await logStage(supabase, event.id, event.clientId, 'complete', 'failed', errorMessage, Date.now() - startTime);

      return {
        success: false,
        error: errorMessage,
        shouldRetry: false,
      };
    }
  }
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const transientPatterns = [
      'timeout',
      'network',
      'connection',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'unavailable',
      'rate limit',
      'too many requests',
      'deadlock',
      'serialization failure',
    ];

    const message = error.message.toLowerCase();
    return transientPatterns.some((pattern) => message.includes(pattern.toLowerCase()));
  }

  return false;
}