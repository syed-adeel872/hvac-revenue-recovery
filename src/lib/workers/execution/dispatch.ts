import { SupabaseClient } from '@supabase/supabase-js';
import { ClaimedRecoveryAction, DispatchResult } from './types';
import { MessagingAdapter } from './adapters';

interface DraftOutput {
  response: string;
  tone: string;
  keyPoints: string[];
  safetyDecision?: string;
}

interface ActionInput {
  originalActionId?: string;
  intent?: string;
  channel?: string;
  estimatedRevenue?: number;
  customerPhone?: string;
  customerEmail?: string;
}

export async function dispatchMessage(
  supabase: SupabaseClient,
  action: ClaimedRecoveryAction,
  adapter: MessagingAdapter,
): Promise<DispatchResult> {
  const output = action.output as DraftOutput | null;
  const input = action.input as ActionInput | null;

  if (!output?.response) {
    return { success: false, error: 'No response content in action output' };
  }

  if (!action.conversationId) {
    return { success: false, error: 'No conversation ID associated with action' };
  }

  const channel = (input?.channel ?? 'sms') as 'sms' | 'email';
  const to = channel === 'sms' ? (input?.customerPhone ?? '') : (input?.customerEmail ?? '');

  if (!to) {
    return { success: false, error: `No ${channel} address available for customer` };
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('customer_id')
    .eq('id', action.conversationId)
    .eq('client_id', action.clientId)
    .single();

  if (convError || !conversation) {
    return { success: false, error: 'Failed to load conversation context' };
  }

  const deliveryResult = await adapter.send({
    channel,
    to,
    content: output.response,
    clientId: action.clientId,
    customerId: conversation.customer_id,
    conversationId: action.conversationId,
  });

  if (!deliveryResult.success) {
    const { error: msgError } = await supabase.from('messages').insert({
      client_id: action.clientId,
      conversation_id: action.conversationId,
      customer_id: conversation.customer_id,
      direction: 'outbound',
      channel,
      content: output.response,
      status: 'failed',
      error_code: deliveryResult.errorCode ?? 'UNKNOWN',
      error_message: deliveryResult.error ?? 'Unknown error',
      metadata: JSON.stringify({ actionId: action.id }),
    });

    if (msgError) {
      return { success: false, error: `Failed to record failed message: ${msgError.message}` };
    }

    return {
      success: false,
      error: deliveryResult.error ?? 'Delivery failed',
    };
  }

  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      client_id: action.clientId,
      conversation_id: action.conversationId,
      customer_id: conversation.customer_id,
      direction: 'outbound',
      channel,
      content: output.response,
      status: 'sent',
      external_message_id: deliveryResult.externalId ?? null,
      sent_at: new Date().toISOString(),
      metadata: JSON.stringify({ actionId: action.id }),
    })
    .select('id')
    .single();

  if (msgError) {
    return { success: false, error: `Failed to record sent message: ${msgError.message}` };
  }

  return {
    success: true,
    messageId: message.id,
    externalId: deliveryResult.externalId,
  };
}
