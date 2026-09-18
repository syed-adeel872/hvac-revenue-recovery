import OpenAI from 'openai';
import { z } from 'zod';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL;

if (!LLM_API_KEY) {
  throw new Error('Missing required environment variable: LLM_API_KEY');
}
if (!LLM_BASE_URL) {
  throw new Error('Missing required environment variable: LLM_BASE_URL');
}
if (!LLM_MODEL) {
  throw new Error('Missing required environment variable: LLM_MODEL');
}

const openai = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_BASE_URL,
  timeout: 30_000,
  maxRetries: 2,
});

export interface LLMCallOptions<T extends z.ZodType> {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: T;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCallResult<T> {
  data: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callLLM<T extends z.ZodType>(
  options: LLMCallOptions<T>
): Promise<LLMCallResult<z.infer<T>>> {
  const { systemPrompt, userPrompt, responseSchema, temperature = 0.3, maxTokens = 1024 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await delay(RETRY_DELAY_MS * attempt);
      }

      const response = await openai.chat.completions.create({
        model: LLM_MODEL as string,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content?.trim() || '';

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error('LLM returned invalid JSON');
      }

      const result = responseSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`LLM output failed schema validation: ${result.error.message}`);
      }

      return {
        data: result.data,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES) break;
    }
  }

  throw new Error(`LLM call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}
