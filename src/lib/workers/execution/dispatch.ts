import { SupabaseClient } from '@supabase/supabase-js';
import { ClaimedRecoveryAction, DispatchResult } from './types';
import { MessagingAdapter } from './adapters';
import { checkKillSwitch } from '@/lib/safety/resilience/kill-switch';
import { checkConsentStatus, checkOptOutStatus } from '@/lib/safety/consent-checker';

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

  const channel = (input?.channel ?? 'sms') as 'sms' | 'email' | 'phone_call';
  const to = channel === 'sms' || channel === 'phone_call' ? (input?.customerPhone ?? '') : (input?.customerEmail ?? '');
  const traceId = (action.metadata as Record<string, unknown>)?.trace_id as string | undefined ?? action.id;

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

  const ks = await checkKillSwitch(supabase, action.clientId);
  if (ks.enabled) {
    return { success: false, error: `Kill switch active: ${ks.reason}` };
  }

  const consent = await checkConsentStatus(supabase, action.clientId, conversation.customer_id, channel);
  if (!consent || consent.status === 'revoked' || consent.status === 'unknown') {
    return { success: false, error: 'Consent not verified or customer opted out' };
  }

  const optedOut = await checkOptOutStatus(supabase, action.clientId, conversation.customer_id);
  if (optedOut) {
    return { success: false, error: 'Customer has opted out' };
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
      metadata: JSON.stringify({ actionId: action.id, traceId }),
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
      metadata: JSON.stringify({ actionId: action.id, traceId }),
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
