import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runPipeline, runMultiTenantPipeline } from '@/lib/pipeline/orchestrator';
import { z } from 'zod';

const VALID_BATCH_SIZES = [5, 10, 25, 50];
const CRON_SECRET = process.env.CRON_SECRET;

const multiTenantSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1).max(50),
});

const singleTenantSchema = z.object({
  clientId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine for single-client mode
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

  if (body.batchSize && VALID_BATCH_SIZES.includes(body.batchSize as number)) {
    batchSize = body.batchSize as number;
  }

  try {
    const supabase = await createAdminClient();
    const skipStages = Array.isArray(body.skipStages) ? body.skipStages as string[] : [];

    if (body.clientIds && Array.isArray(body.clientIds) && body.clientIds.length > 0) {
      const parsed = multiTenantSchema.safeParse({ clientIds: body.clientIds });
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid clientIds', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const results = await runMultiTenantPipeline({
        supabase,
        clientIds: parsed.data.clientIds,
        batchSize,
        skipStages,
      });

      return NextResponse.json({
        mode: 'multi-tenant',
        clients: results.length,
        results: results.map((r) => ({
          clientId: r.clientId,
          success: r.success,
          stages: r.stages,
        })),
        timestamp: new Date().toISOString(),
      });
    }

    if (body.clientId && typeof body.clientId === 'string') {
      const parsed = singleTenantSchema.safeParse({ clientId: body.clientId });
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid clientId', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const result = await runPipeline({
        supabase,
        clientId: parsed.data.clientId,
        batchSize,
        skipStages,
      });

      return NextResponse.json({
        mode: 'single-tenant',
        clientId: result.clientId,
        success: result.success,
        stages: result.stages,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Provide clientId (string) or clientIds (string[]) in request body' },
      { status: 400 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Pipeline failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
