import { WorkflowEventResult, MapResult } from './types';

export interface CreateWorkflowEventOptions {
  supabase: any;
  clientId: string;
  idempotencyKey: string;
  mapResult: MapResult;
}

export async function createWorkflowEvent(
  options: CreateWorkflowEventOptions
): Promise<WorkflowEventResult> {
  const { supabase, clientId, idempotencyKey, mapResult } = options;

  const { data, error } = await supabase.rpc('insert_workflow_event', {
    p_client_id: clientId,
    p_event_type: mapResult.eventType,
    p_event_source: mapResult.eventSource,
    p_idempotency_key: idempotencyKey,
    p_payload: mapResult.payload,
    p_metadata: mapResult.metadata,
  });

  if (error) {
    throw new Error(`Failed to create workflow event: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Workflow event creation returned no data');
  }

  const workflowEvent = data[0];

  const { data: existing } = await supabase
    .from('workflow_events')
    .select('id')
    .eq('client_id', clientId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  const isDuplicate = existing && existing.id !== workflowEvent.id;

  return {
    id: workflowEvent.id,
    isDuplicate,
  };
}