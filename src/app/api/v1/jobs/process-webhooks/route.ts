import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { processBatchOnce } from '@/lib/webhook/processor';
import { checkHttpRateLimit } from '@/lib/safety/resilience/http-rate-limiter';

const VALID_BATCH_SIZES = [5, 10, 25, 50];

function verifyCronToken(token: string): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  const rl = checkHttpRateLimit('process-webhooks', { windowMs: 60000, maxRequests: 10 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!verifyCronToken(token)) {
    return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
  }

  let batchSize = 10;
  try {
    const url = new URL(request.url);
    const sizeParam = url.searchParams.get('batch_size');
    if (sizeParam) {
      const parsed = parseInt(sizeParam, 10);
      if (!VALID_BATCH_SIZES.includes(parsed)) {
        return NextResponse.json({ error: 'Invalid batch_size. Allowed: 5, 10, 25, 50' }, { status: 400 });
      }
      batchSize = parsed;
    }
  } catch {
    // Use default
  }

  try {
    const supabase = createAdminClient();
    const result = await processBatchOnce({
      supabase,
      config: { batchSize, pollIntervalMs: 0 },
    });

    return NextResponse.json({
      claimed: result.total,
      processed: result.succeeded,
      failed: result.failed,
      retried: result.retried,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Processor failed' }, { status: 500 });
  }
}
