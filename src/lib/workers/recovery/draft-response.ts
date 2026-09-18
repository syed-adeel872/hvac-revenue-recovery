import { z } from 'zod';
import { callLLM } from '@/lib/llm/client';
import { IntentType, ConversationContext } from './types';
import { IntelligenceOutput } from '../intelligence/types';

export const DraftResponseSchema = z.object({
  response: z.string().min(1).max(320),
  tone: z.enum(['professional', 'empathetic', 'urgent', 'neutral']),
  keyPoints: z.array(z.string()),
});

export type DraftResponseOutput = z.infer<typeof DraftResponseSchema>;

export interface DraftResponseOptions {
  intent: IntentType;
  intelligenceOutput: IntelligenceOutput;
  conversationContext?: ConversationContext;
  customerName?: string;
  estimateAmount?: number;
  estimateId?: string;
}

const SYSTEM_PROMPT = `You are an HVAC customer recovery assistant. Draft professional, empathetic follow-up responses to customer messages.

CRITICAL RULES:
1. You must respond ONLY with valid JSON matching the required schema.
2. NEVER invent pricing, discounts, or special offers not provided in the data.
3. NEVER promise appointment availability or specific times not confirmed in the data.
4. NEVER make false promises or guarantees.
5. Keep responses under 320 characters (2 SMS segments).
6. Be professional, helpful, and empathetic.
7. If the customer asks about pricing, acknowledge their question but do not provide specific numbers unless explicitly provided in the context.
8. For opt-out requests, acknowledge respectfully and confirm we will stop contacting them.
9. For reschedule requests, express understanding and offer to help find a new time.`;

function buildDraftPrompt(options: DraftResponseOptions): string {
  const { intent, intelligenceOutput, conversationContext, customerName, estimateAmount, estimateId } = options;

  let prompt = `Draft a response for a customer recovery scenario.

INTENT: ${intent}
CUSTOMER NAME: ${customerName || 'Customer'}
ESTIMATE AMOUNT: ${estimateAmount ? `$${estimateAmount.toLocaleString()}` : 'Not provided'}
ESTIMATE ID: ${estimateId || 'Not provided'}
RECOMMENDED STRATEGY: ${intelligenceOutput.recommendedStrategy}
OPPORTUNITY TYPE: ${intelligenceOutput.opportunityType}

`;

  if (conversationContext && conversationContext.recentMessages.length > 0) {
    prompt += `RECENT CONVERSATION:\n`;
    for (const msg of conversationContext.recentMessages.slice(-5)) {
      prompt += `${msg.direction === 'inbound' ? 'Customer' : 'Us'}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  prompt += `RESPOND WITH VALID JSON ONLY:
{
  "response": "<your drafted response under 320 chars>",
  "tone": "professional|empathetic|urgent|neutral",
  "keyPoints": ["<key point 1>", "<key point 2>"]
}`;

  return prompt;
}

export async function draftResponse(options: DraftResponseOptions): Promise<DraftResponseOutput> {
  const userPrompt = buildDraftPrompt(options);

  const { data } = await callLLM({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseSchema: DraftResponseSchema,
    temperature: 0.4,
    maxTokens: 512,
  });

  return data;
}

export function validateDraftConstraints(draft: DraftResponseOutput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (draft.response.length > 320) {
    errors.push(`Response exceeds 320 characters: ${draft.response.length}`);
  }

  if (draft.response.length === 0) {
    errors.push('Response is empty');
  }

  const pricingPatterns = /\b(\$\d+|\d+\s*dollars?|discount|free|cheaper|special\s*offer)\b/i;
  if (pricingPatterns.test(draft.response)) {
    const hasEstimateContext = false;
    if (!hasEstimateContext) {
      errors.push('Response contains pricing language without explicit context');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
