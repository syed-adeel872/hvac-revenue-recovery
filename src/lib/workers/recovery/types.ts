import { z } from 'zod';
import { IntelligenceOutput } from '../intelligence/types';
import { SafetyDecision } from '@/lib/safety/types';

export const IntentTypeSchema = z.enum([
  'interested',
  'opt_out',
  'reschedule',
  'pricing_question',
  'general_question',
  'unknown',
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

export interface InboundMessage {
  content: string;
  channel: string;
  receivedAt: string;
}

export interface ConversationContext {
  conversationId: string;
  channel: string;
  recentMessages: Array<{
    content: string;
    direction: 'inbound' | 'outbound';
    receivedAt: string;
  }>;
}

export interface RecoveryInput {
  actionId: string;
  clientId: string;
  customerId: string;
  conversationId?: string;
  estimateId?: string;
  leadId?: string;
  intelligenceOutput: IntelligenceOutput;
  inboundMessage?: InboundMessage;
  conversationContext?: ConversationContext;
}

export const RecoveryOutputSchema = z.object({
  intent: IntentTypeSchema,
  draftedResponse: z.string().min(1).max(320),
  channel: z.string(),
  safetyDecision: z.enum(['ALLOW', 'BLOCK', 'ESCALATE']),
  confidence: z.number().min(0).max(1),
});

export type RecoveryOutput = z.infer<typeof RecoveryOutputSchema>;

export interface RecoveryResult {
  success: boolean;
  output?: RecoveryOutput;
  actionId?: string;
  error?: string;
}

export interface ClaimedAction {
  id: string;
  clientId: string;
  customerId: string;
  conversationId?: string;
  estimateId?: string;
  leadId?: string;
  workflowEventId?: string;
  actionType: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  riskLevel: string;
  status: string;
}

export const CONFIDENCE_THRESHOLD = 0.70;

export const CHANNEL_MAP: Record<string, 'sms' | 'email' | 'phone_call'> = {
  sms: 'sms',
  email: 'email',
  phone: 'phone_call',
  chat: 'sms',
};
