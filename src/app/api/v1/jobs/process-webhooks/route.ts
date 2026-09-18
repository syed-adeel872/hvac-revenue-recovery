import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { processBatchOnce } from '@/lib/webhook/processor';

const VALID_BATCH_SIZES = [5, 10, 25, 50];

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (token !== process.env.CRON_SECRET) {
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
    const supabase = await createAdminClient();
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
