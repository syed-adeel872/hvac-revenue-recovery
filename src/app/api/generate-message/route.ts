import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateFollowupMessage } from '@/lib/gemini'

const CRON_SECRET = process.env.CRON_SECRET

const schema = z.object({
  customerName: z.string().min(1).max(100),
  hvacIssue: z.string().min(5).max(500),
  estimateAmount: z.number().positive().max(100000),
})

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    )
  }

  try {
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const message = await generateFollowupMessage(parsed.data)
    return NextResponse.json({ message })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate message' },
      { status: 500 }
    )
  }
}