import { ClaimedAction } from './types';

export interface ClaimActionsOptions {
  supabase: any;
  clientId: string;
  batchSize?: number;
}

export async function claimIntelligenceActions(
  options: ClaimActionsOptions
): Promise<ClaimedAction[]> {
  const { supabase, clientId, batchSize = 10 } = options;

  const { data: actions, error } = await supabase
    .from('actions')
    .select('id, client_id, customer_id, conversation_id, estimate_id, lead_id, workflow_event_id, action_type, input, output, risk_level, status')
    .eq('client_id', clientId)
    .eq('worker_type', 'intelligence')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(`Failed to claim intelligence actions: ${error.message}`);
  }

  if (!actions || actions.length === 0) {
    return [];
  }

  const actionIds = actions.map((a: any) => a.id);

  const { data: updated, error: updateError } = await supabase
    .from('actions')
    .update({
      status: 'executing',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', actionIds)
    .eq('status', 'approved')
    .select('id');

  if (updateError) {
    throw new Error(`Failed to update action status to executing: ${updateError.message}`);
  }

  if (!updated || updated.length === 0) {
    return [];
  }

  const claimedIds = new Set(updated.map((a: any) => a.id));

  return actions
    .filter((a: any) => claimedIds.has(a.id))
    .map((a: any) => ({
      id: a.id,
      clientId: a.client_id,
      customerId: a.customer_id,
      conversationId: a.conversation_id,
      estimateId: a.estimate_id,
      leadId: a.lead_id,
      workflowEventId: a.workflow_event_id,
      actionType: a.action_type,
      input: a.input ?? {},
      output: a.output ?? {},
      riskLevel: a.risk_level,
      status: a.status,
    }));
}

export async function claimInboundMessages(
  options: ClaimActionsOptions & { conversationId?: string }
): Promise<Array<{
  id: string;
  clientId: string;
  customerId: string;
  conversationId: string;
  content: string;
  channel: string;
  receivedAt: string;
}>> {
  const { supabase, clientId, batchSize = 10, conversationId } = options;

  let query = supabase
    .from('messages')
    .select('id, client_id, customer_id, conversation_id, content, channel, created_at')
    .eq('client_id', clientId)
    .eq('direction', 'inbound')
    .eq('status', 'received')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (conversationId) {
    query = query.eq('conversation_id', conversationId);
  }

  const { data: messages, error } = await query;

  if (error) {
    throw new Error(`Failed to claim inbound messages: ${error.message}`);
  }

  if (!messages || messages.length === 0) {
    return [];
  }

  return messages.map((m: any) => ({
    id: m.id,
    clientId: m.client_id,
    customerId: m.customer_id,
    conversationId: m.conversation_id,
    content: m.content,
    channel: m.channel,
    receivedAt: m.created_at,
  }));
}

export async function getConversationHistory(
  supabase: any,
  clientId: string,
  conversationId: string,
  limit: number = 5
): Promise<Array<{
  content: string;
  direction: 'inbound' | 'outbound';
  receivedAt: string;
}>> {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('content, direction, created_at')
    .eq('client_id', clientId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get conversation history: ${error.message}`);
  }

  if (!messages) return [];

  return messages.reverse().map((m: any) => ({
    content: m.content,
    direction: m.direction as 'inbound' | 'outbound',
    receivedAt: m.created_at,
  }));
}
