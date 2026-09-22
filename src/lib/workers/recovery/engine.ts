import { evaluateSafety } from '@/lib/safety/evaluate-safety';
import { recordOptOut } from '@/lib/safety/consent-checker';
import { IntelligenceOutput } from '../intelligence/types';
import { classifyIntent } from './classify-intent';
import { draftResponse, validateDraftConstraints, DraftResponseOutput } from './draft-response';
import { claimIntelligenceActions, claimInboundMessages, getConversationHistory } from './claim-actions';
import { transitionActionStatus } from '../transition-status';
import {
  RecoveryInput,
  RecoveryOutput,
  RecoveryResult,
  ClaimedAction,
  IntentType,
  CHANNEL_MAP,
  CONFIDENCE_THRESHOLD,
} from './types';

export interface ProcessRecoveryOptions {
  supabase: any;
  action: ClaimedAction;
}

export async function processRecovery(
  options: ProcessRecoveryOptions
): Promise<RecoveryResult> {
  const { supabase, action } = options;

  try {
    const intelligenceOutput = action.output as unknown as IntelligenceOutput;

    const inboundMessage = action.input.inboundMessage as { content: string; channel: string } | undefined;

    let intent: IntentType = 'unknown';
    if (inboundMessage?.content) {
      intent = classifyIntent(inboundMessage.content);
    } else {
      intent = mapStrategyToIntent(intelligenceOutput.recommendedStrategy);
    }

    if (intent === 'opt_out' && action.customerId) {
      const channel = inboundMessage?.channel || 'sms';
      const safetyChannel = CHANNEL_MAP[channel] || 'sms';
      try {
        await recordOptOut(supabase, action.clientId, action.customerId, safetyChannel);
      } catch (optOutError) {
        console.error('[Recovery] Failed to record opt-out:', optOutError instanceof Error ? optOutError.message : 'Unknown error');
      }
    }

    let conversationContext = undefined;
    if (action.conversationId) {
      const history = await getConversationHistory(supabase, action.clientId, action.conversationId);
      if (history.length > 0) {
        conversationContext = {
          conversationId: action.conversationId,
          channel: inboundMessage?.channel || 'sms',
          recentMessages: history,
        };
      }
    }

    const estimateAmount = typeof intelligenceOutput.estimatedRevenue === 'number'
      ? intelligenceOutput.estimatedRevenue
      : undefined;

    const draft = await draftResponse({
      intent,
      intelligenceOutput,
      conversationContext,
      estimateAmount,
      estimateId: action.estimateId,
      supabase,
      clientId: action.clientId,
      correlationId: action.id,
    });

    const validation = validateDraftConstraints(draft, { estimateAmount });
    if (!validation.valid) {
      await markActionFailed(supabase, action, validation.errors.join(', '));
      return {
        success: false,
        error: `Draft validation failed: ${validation.errors.join(', ')}`,
      };
    }

    const channel = inboundMessage?.channel || 'sms';
    const safetyChannel = CHANNEL_MAP[channel] || 'sms';

    const safetyResult = await evaluateSafety(supabase, {
      clientId: action.clientId,
      customerId: action.customerId,
      channel: safetyChannel,
      actionType: 'recovery_response',
      metadata: {
        intent,
        confidence: intelligenceOutput.confidence,
        estimatedRevenue: intelligenceOutput.estimatedRevenue,
        messageContent: inboundMessage?.content,
      },
    });

    const recoveryOutput: RecoveryOutput = {
      intent,
      draftedResponse: draft.response,
      channel,
      safetyDecision: safetyResult.decision,
      confidence: intelligenceOutput.confidence,
    };

    if (safetyResult.decision === 'BLOCK') {
      await markActionRejected(supabase, action, safetyResult.reason);
      return {
        success: true,
        output: recoveryOutput,
        error: `Safety BLOCK: ${safetyResult.reason}`,
      };
    }

    if (safetyResult.decision === 'ESCALATE' || intelligenceOutput.confidence < CONFIDENCE_THRESHOLD) {
      const actionId = await createRecoveryAction(supabase, action, recoveryOutput, true);
      await markActionCompleted(supabase, action);
      return {
        success: true,
        output: recoveryOutput,
        actionId,
      };
    }

    const actionId = await createRecoveryAction(supabase, action, recoveryOutput, false);
    await markActionCompleted(supabase, action);

    return {
      success: true,
      output: recoveryOutput,
      actionId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markActionFailed(supabase, action, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

function mapStrategyToIntent(strategy: string): IntentType {
  switch (strategy) {
    case 'standard_followup':
    case 'urgent_followup':
      return 'interested';
    case 'discount_offer':
      return 'pricing_question';
    case 'flag_for_human_review':
    case 'escalate':
      return 'general_question';
    default:
      return 'general_question';
  }
}

async function lookupCustomerContact(
  supabase: any,
  clientId: string,
  customerId: string,
): Promise<{ phone?: string; email?: string }> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('phone, email')
      .eq('id', customerId)
      .eq('client_id', clientId)
      .single();

    if (error || !data) return {};
    return {
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
    };
  } catch {
    return {};
  }
}

async function createRecoveryAction(
  supabase: any,
  originalAction: ClaimedAction,
  output: RecoveryOutput,
  approvalRequired: boolean,
): Promise<string> {
  const idempotencyKey = `recovery:${originalAction.id}`;
  const traceId = (originalAction as any).metadata?.trace_id ?? originalAction.id;

  const customerContact = originalAction.customerId
    ? await lookupCustomerContact(supabase, originalAction.clientId, originalAction.customerId)
    : {};

  const { data, error } = await supabase
    .from('actions')
    .insert({
      client_id: originalAction.clientId,
      customer_id: originalAction.customerId,
      conversation_id: originalAction.conversationId,
      estimate_id: originalAction.estimateId,
      lead_id: originalAction.leadId,
      workflow_event_id: originalAction.workflowEventId,
      worker_type: 'recovery',
      action_type: 'draft_response',
      risk_level: approvalRequired ? 'yellow' : 'green',
      status: approvalRequired ? 'pending' : 'approved',
      approval_required: approvalRequired,
      input: {
        originalActionId: originalAction.id,
        intent: output.intent,
        channel: output.channel,
        estimatedRevenue: (originalAction.output as any)?.estimatedRevenue,
        customerPhone: customerContact.phone ?? null,
        customerEmail: customerContact.email ?? null,
      },
      output: {
        response: output.draftedResponse,
        draftedResponse: output.draftedResponse,
        tone: 'professional',
        safetyDecision: output.safetyDecision,
        confidence: output.confidence,
      },
      idempotency_key: idempotencyKey,
      metadata: { trace_id: traceId },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create recovery action: ${error.message}`);
  }

  return data.id;
}

async function markActionCompleted(supabase: any, action: ClaimedAction): Promise<void> {
  await transitionActionStatus(supabase, action.id, 'completed');
}

async function markActionRejected(supabase: any, action: ClaimedAction, reason: string): Promise<void> {
  await transitionActionStatus(supabase, action.id, 'rejected', undefined, undefined, reason);
}

async function markActionFailed(supabase: any, action: ClaimedAction, errorMessage: string): Promise<void> {
  await transitionActionStatus(supabase, action.id, 'failed', undefined, undefined, errorMessage);
}

export interface ProcessBatchOptions {
  supabase: any;
  clientId: string;
  batchSize?: number;
}

export interface ProcessBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: RecoveryResult[];
}

export async function processBatch(options: ProcessBatchOptions): Promise<ProcessBatchResult> {
  const { supabase, clientId, batchSize = 10 } = options;

  const actions = await claimIntelligenceActions({ supabase, clientId, batchSize });

  if (actions.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, results: [] };
  }

  const results: RecoveryResult[] = [];

  for (const action of actions) {
    const result = await processRecovery({ supabase, action });
    results.push(result);
  }

  return {
    total: actions.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export interface ProcessInboundMessagesOptions {
  supabase: any;
  clientId: string;
  batchSize?: number;
}

export interface ProcessInboundMessagesResult {
  total: number;
  succeeded: number;
  failed: number;
}

export async function processInboundMessages(
  options: ProcessInboundMessagesOptions
): Promise<ProcessInboundMessagesResult> {
  const { supabase, clientId, batchSize = 10 } = options;

  const messages = await claimInboundMessages({ supabase, clientId, batchSize });

  if (messages.length === 0) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const msg of messages) {
    try {
      const intent = classifyIntent(msg.content);

      if (intent === 'opt_out') {
        try {
          await recordOptOut(supabase, clientId, msg.customerId, msg.channel as 'sms' | 'email' | 'phone_call');
        } catch (optOutError) {
          console.error('[Recovery] Failed to record inbound opt-out:', optOutError instanceof Error ? optOutError.message : 'Unknown error');
        }
      }

      const conversationHistory = await getConversationHistory(supabase, clientId, msg.conversationId, 5);

      const draft = await draftResponse({
        intent: intent === 'opt_out' ? 'general_question' : intent,
        intelligenceOutput: {
          opportunityType: 'other',
          qualificationScore: 0,
          estimatedRevenue: 0,
          recommendedStrategy: 'standard_followup',
          riskFactors: [],
          confidence: 1.0,
          reasoning: 'Inbound customer message',
        },
        conversationContext: {
          conversationId: msg.conversationId,
          channel: msg.channel,
          recentMessages: conversationHistory,
        },
        supabase,
        clientId,
        correlationId: msg.id,
      });

      const validation = validateDraftConstraints(draft);
      if (!validation.valid) {
        await supabase
          .from('messages')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', msg.id)
          .eq('client_id', clientId);
        failed++;
        continue;
      }

      const safetyResult = await evaluateSafety(supabase, {
        clientId,
        customerId: msg.customerId,
        channel: (CHANNEL_MAP[msg.channel] || 'sms') as 'sms' | 'email' | 'phone_call',
        actionType: 'inbound_response',
        metadata: { intent, messageId: msg.id, messageContent: msg.content },
      });

      if (safetyResult.decision === 'BLOCK') {
        await supabase
          .from('messages')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', msg.id)
          .eq('client_id', clientId);
        failed++;
        continue;
      }

      await supabase.from('actions').insert({
        client_id: clientId,
        customer_id: msg.customerId,
        conversation_id: msg.conversationId,
        worker_type: 'recovery',
        action_type: 'draft_response',
        risk_level: safetyResult.decision === 'ESCALATE' ? 'yellow' : 'green',
        status: safetyResult.decision === 'ESCALATE' ? 'pending' : 'approved',
        approval_required: safetyResult.decision === 'ESCALATE',
        input: {
          messageId: msg.id,
          intent,
          channel: msg.channel,
          content: msg.content,
        },
        output: {
          response: draft.response,
          draftedResponse: draft.response,
          tone: draft.tone,
          safetyDecision: safetyResult.decision,
          confidence: 1.0,
        },
        idempotency_key: `inbound:${msg.id}`,
      });

      await supabase
        .from('messages')
        .update({ status: 'processed', updated_at: new Date().toISOString() })
        .eq('id', msg.id)
        .eq('client_id', clientId);

      succeeded++;
    } catch {
      await supabase
        .from('messages')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', msg.id)
        .eq('client_id', clientId);
      failed++;
    }
  }

  return { total: messages.length, succeeded, failed };
}
