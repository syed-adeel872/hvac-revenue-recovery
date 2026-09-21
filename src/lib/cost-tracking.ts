import { SupabaseClient } from '@supabase/supabase-js';

interface RecordLLMUsageOptions {
  supabase: SupabaseClient;
  clientId: string;
  provider: string;
  model: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  responseTimeMs: number;
  statusCode: number;
  correlationId?: string;
}

export async function recordLLMUsage(options: RecordLLMUsageOptions): Promise<void> {
  const {
    supabase,
    clientId,
    provider,
    model,
    endpoint,
    promptTokens,
    completionTokens,
    totalTokens,
    responseTimeMs,
    statusCode,
    correlationId,
  } = options;

  const estimatedCost = calculateEstimatedCost(provider, model, promptTokens, completionTokens);

  try {
    await supabase.from('api_usage').insert({
      client_id: clientId,
      provider,
      endpoint,
      method: 'POST',
      status_code: statusCode,
      request_count: 1,
      response_time_ms: responseTimeMs,
      cost_usd: estimatedCost,
      metadata: {
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        correlation_id: correlationId,
      },
    });

    if (estimatedCost > 0) {
      await supabase.from('cost_ledger').insert({
        client_id: clientId,
        category: 'llm',
        provider,
        description: `LLM call: ${model} (${promptTokens}+${completionTokens} tokens)`,
        amount_usd: estimatedCost,
        quantity: totalTokens,
        unit_cost_usd: totalTokens > 0 ? estimatedCost / totalTokens : 0,
        reference_type: 'api_usage',
        metadata: {
          model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          correlation_id: correlationId,
        },
      });
    }
  } catch {
    // Cost tracking failure is non-critical; log but don't throw
  }
}

function calculateEstimatedCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
    'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
  };

  const modelPricing = pricing[model] ?? pricing['gpt-4o-mini'];
  const cost = promptTokens * modelPricing.input + completionTokens * modelPricing.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
