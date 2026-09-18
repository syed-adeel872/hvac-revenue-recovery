import { z } from 'zod';

export const OpportunityTypeSchema = z.enum([
  'unbooked_estimate',
  'missed_followup',
  'abandoned_cart',
  'other',
]);

export const RecommendedStrategySchema = z.enum([
  'standard_followup',
  'urgent_followup',
  'discount_offer',
  'flag_for_human_review',
  'escalate',
]);

export const RiskLevelSchema = z.enum(['green', 'yellow', 'red']);

export const IntelligenceOutputSchema = z.object({
  opportunityType: OpportunityTypeSchema,
  qualificationScore: z.number().min(0).max(100),
  estimatedRevenue: z.number().min(0),
  recommendedStrategy: RecommendedStrategySchema,
  riskFactors: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(2000),
});

export type OpportunityType = z.infer<typeof OpportunityTypeSchema>;
export type RecommendedStrategy = z.infer<typeof RecommendedStrategySchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type IntelligenceOutput = z.infer<typeof IntelligenceOutputSchema>;

export interface IntelligenceInput {
  workflowEventId: string;
  clientId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface IntelligenceResult {
  success: boolean;
  output?: IntelligenceOutput;
  actionId?: string;
  error?: string;
}

export interface ClaimedWorkflowEvent {
  id: string;
  clientId: string;
  eventType: string;
  eventSource: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const PROCESSED_EVENT_TYPES = [
  'estimate_sent',
  'unbooked_estimate',
  'lead_created',
  'estimate_updated',
] as const;

export const CONFIDENCE_THRESHOLD = 0.70;

export function determineRiskLevel(output: IntelligenceOutput): RiskLevel {
  if (output.confidence < CONFIDENCE_THRESHOLD) return 'red';
  if (output.estimatedRevenue >= 10000) return 'yellow';
  return 'green';
}

export function determineApprovalRequired(output: IntelligenceOutput): boolean {
  return output.confidence < CONFIDENCE_THRESHOLD || output.estimatedRevenue >= 10000;
}
