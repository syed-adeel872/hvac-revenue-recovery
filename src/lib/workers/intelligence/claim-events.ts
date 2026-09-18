import { ClaimedWorkflowEvent, PROCESSED_EVENT_TYPES } from './types';

export interface ClaimEventsOptions {
  supabase: any;
  clientId: string;
  batchSize?: number;
}

export async function claimEvents(
  options: ClaimEventsOptions
): Promise<ClaimedWorkflowEvent[]> {
  const { supabase, clientId, batchSize = 10 } = options;

  const { data: events, error } = await supabase
    .from('workflow_events')
    .select('id, client_id, event_type, event_source, payload, metadata, created_at')
    .eq('client_id', clientId)
    .eq('processed', false)
    .in('event_type', PROCESSED_EVENT_TYPES)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(`Failed to claim workflow events: ${error.message}`);
  }

  if (!events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((e: any) => e.id);

  const { data: updated, error: updateError } = await supabase
    .from('workflow_events')
    .update({
      processing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', eventIds)
    .eq('processed', false)
    .select('id');

  if (updateError) {
    throw new Error(`Failed to update workflow events: ${updateError.message}`);
  }

  if (!updated || updated.length === 0) {
    return [];
  }

  const claimedIds = new Set(updated.map((e: any) => e.id));

  return events
    .filter((e: any) => claimedIds.has(e.id))
    .map((e: any) => ({
      id: e.id,
      clientId: e.client_id,
      eventType: e.event_type,
      eventSource: e.event_source,
      payload: e.payload ?? {},
      metadata: e.metadata ?? {},
      createdAt: e.created_at,
    }));
}

export async function markEventProcessed(
  supabase: any,
  eventId: string,
  clientId: string,
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, any> = {
    processed: true,
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) {
    updates.processing_error = errorMessage;
  }

  const { error } = await supabase
    .from('workflow_events')
    .update(updates)
    .eq('id', eventId)
    .eq('client_id', clientId);

  if (error) {
    throw new Error(`Failed to mark event as processed: ${error.message}`);
  }
}
