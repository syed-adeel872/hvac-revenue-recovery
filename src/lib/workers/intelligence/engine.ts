import { callLLM } from '@/lib/llm/client';
import { sanitizePayload, extractCustomerContext } from './sanitize';
import { SYSTEM_PROMPT, buildAnalysisPrompt, AnalysisPromptData } from './prompts';
import { claimEvents, markEventProcessed } from './claim-events';
import {
  IntelligenceInput,
  IntelligenceOutput,
  IntelligenceOutputSchema,
  IntelligenceResult,
  ClaimedWorkflowEvent,
  CONFIDENCE_THRESHOLD,
  determineRiskLevel,
  determineApprovalRequired,
} from './types';

export interface ProcessEventOptions {
  supabase: any;
  event: ClaimedWorkflowEvent;
}

export async function processEvent(options: ProcessEventOptions): Promise<IntelligenceResult> {
  const { supabase, event } = options;

  try {
    const sanitizedPayload = sanitizePayload(event.payload);
    const customerContext = extractCustomerContext(sanitizedPayload);

    const daysSinceSent = calculateDaysSinceSent(sanitizedPayload);
    const hasViewedEstimate = sanitizedPayload.viewed_at !== null && sanitizedPayload.viewed_at !== undefined;
    const previousFollowups = typeof sanitizedPayload.previous_followups === 'number'
      ? sanitizedPayload.previous_followups
      : 0;

    const promptData: AnalysisPromptData = {
      eventType: event.eventType,
      customerContext,
      daysSinceEstimateSent: daysSinceSent,
      hasViewedEstimate,
      previousFollowups,
    };

    const userPrompt = buildAnalysisPrompt(promptData);

    const { data: output } = await callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      responseSchema: IntelligenceOutputSchema,
      temperature: 0.3,
      maxTokens: 1024,
    });

    const strategyAdjustedOutput = adjustStrategy(output, daysSinceSent);

    const actionId = await recordAction(supabase, event, strategyAdjustedOutput);

    await markEventProcessed(supabase, event.id, event.clientId);

    return {
      success: true,
      output: strategyAdjustedOutput,
      actionId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markEventProcessed(supabase, event.id, event.clientId, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

function calculateDaysSinceSent(payload: Record<string, unknown>): number | undefined {
  const sentAt = payload.sent_at || payload.sentAt;
  if (!sentAt || typeof sentAt !== 'string') return undefined;

  const sentDate = new Date(sentAt);
  const now = new Date();
  const diffMs = now.getTime() - sentDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function adjustStrategy(output: IntelligenceOutput, daysSinceSent?: number): IntelligenceOutput {
  if (output.confidence < CONFIDENCE_THRESHOLD) {
    return { ...output, recommendedStrategy: 'flag_for_human_review' };
  }
  if (output.estimatedRevenue >= 10000) {
    return { ...output, recommendedStrategy: 'flag_for_human_review' };
  }
  if (daysSinceSent && daysSinceSent > 14 && output.recommendedStrategy === 'standard_followup') {
    return { ...output, recommendedStrategy: 'urgent_followup' };
  }
  return output;
}

async function recordAction(
  supabase: any,
  event: ClaimedWorkflowEvent,
  output: IntelligenceOutput
): Promise<string> {
  const riskLevel = determineRiskLevel(output);
  const approvalRequired = determineApprovalRequired(output);

  const idempotencyKey = `intelligence:${event.id}`;

  const { data, error } = await supabase
    .from('actions')
    .insert({
      client_id: event.clientId,
      workflow_event_id: event.id,
      worker_type: 'intelligence',
      action_type: 'revenue_recovery_analysis',
      risk_level: riskLevel,
      status: approvalRequired ? 'pending' : 'approved',
      approval_required: approvalRequired,
      input: {
        eventType: event.eventType,
        payload: event.payload,
      },
      output: {
        opportunityType: output.opportunityType,
        qualificationScore: output.qualificationScore,
        estimatedRevenue: output.estimatedRevenue,
        recommendedStrategy: output.recommendedStrategy,
        riskFactors: output.riskFactors,
        confidence: output.confidence,
        reasoning: output.reasoning,
      },
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to record action: ${error.message}`);
  }

  return data.id;
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
  results: IntelligenceResult[];
}

export async function processBatch(options: ProcessBatchOptions): Promise<ProcessBatchResult> {
  const { supabase, clientId, batchSize = 10 } = options;

  const events = await claimEvents({ supabase, clientId, batchSize });

  if (events.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, results: [] };
  }

  const results: IntelligenceResult[] = [];

  for (const event of events) {
    const result = await processEvent({ supabase, event });
    results.push(result);
  }

  return {
    total: events.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
