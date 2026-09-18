import { evaluateSafety } from '@/lib/safety/evaluate-safety';
import { IntelligenceOutput } from '../intelligence/types';
import { classifyIntent } from './classify-intent';
import { draftResponse, validateDraftConstraints } from './draft-response';
import { claimIntelligenceActions, claimInboundMessages, getConversationHistory } from './claim-actions';
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
    });

    const validation = validateDraftConstraints(draft);
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
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create recovery action: ${error.message}`);
  }

  return data.id;
}

async function markActionCompleted(supabase: any, action: ClaimedAction): Promise<void> {
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', action.id)
    .eq('client_id', action.clientId);

  if (error) {
    throw new Error(`Failed to mark action as completed: ${error.message}`);
  }
}

async function markActionRejected(supabase: any, action: ClaimedAction, reason: string): Promise<void> {
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', action.id)
    .eq('client_id', action.clientId);

  if (error) {
    throw new Error(`Failed to mark action as rejected: ${error.message}`);
  }
}

async function markActionFailed(supabase: any, action: ClaimedAction, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', action.id)
    .eq('client_id', action.clientId);

  if (error) {
    throw new Error(`Failed to mark action as failed: ${error.message}`);
  }
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
