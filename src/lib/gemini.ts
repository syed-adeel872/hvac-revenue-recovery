import OpenAI from 'openai'

const LLM_API_KEY = process.env.LLM_API_KEY
const LLM_BASE_URL = process.env.LLM_BASE_URL
const LLM_MODEL = process.env.LLM_MODEL

if (!LLM_API_KEY) {
  throw new Error('Missing required environment variable: LLM_API_KEY')
}
if (!LLM_BASE_URL) {
  throw new Error('Missing required environment variable: LLM_BASE_URL')
}
if (!LLM_MODEL) {
  throw new Error('Missing required environment variable: LLM_MODEL')
}

const openai = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_BASE_URL,
  timeout: 30_000,
  maxRetries: 2,
})

export async function generateFollowupMessage(params: {
  customerName: string
  hvacIssue: string
  estimateAmount: number
}): Promise<string> {
  const prompt = `Generate a professional, empathetic follow-up SMS for an HVAC customer.
Customer: ${params.customerName}
Issue: ${params.hvacIssue}
Estimate: $${params.estimateAmount.toLocaleString()}
Tone: Professional, helpful, not pushy. Under 160 chars. Max 3 sentences.
CRITICAL: You MUST complete the final sentence fully. Do NOT cut off mid-sentence. The SMS must end with a complete sentence and proper punctuation.
Return only the message text, no markdown, no code blocks.`

  const response = await openai.chat.completions.create({
    model: LLM_MODEL as string,
    messages: [
      { role: 'system', content: 'You write concise, professional HVAC follow-up texts. Always complete sentences fully.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 800,
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content?.trim() || ''
  return cleanLLMResponse(content)
}

function cleanLLMResponse(text: string): string {
  return text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()
}