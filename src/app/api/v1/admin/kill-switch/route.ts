import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyAuthOrCron } from '@/lib/auth';
import { resolveClientId } from '@/lib/admin-tenant';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  const user = await verifyAuthOrCron(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'global_kill_switch')
      .maybeSingle();

    if (error) {
      console.warn('[KillSwitch:GET] Query error:', error.message, error.code);
      return NextResponse.json({ globalEnabled: false });
    }

    return NextResponse.json({ globalEnabled: data?.value === 'true' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[KillSwitch:GET] Error:', message);
    return NextResponse.json({ globalEnabled: false });
  }
}

const toggleSchema = z.object({
  global: z.boolean(),
  confirmation: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await verifyAuthOrCron(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!parsed.data.global && parsed.data.confirmation !== 'DISABLE') {
    return NextResponse.json(
      { error: 'Deactivation requires explicit confirmation. Set confirmation to "DISABLE".' },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);

    const { data: memberRole } = await supabase
      .from('client_members')
      .select('role')
      .eq('client_id', clientId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!memberRole || memberRole.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the project owner may toggle the global kill switch' },
        { status: 403 },
      );
    }

    const value = parsed.data.global ? 'true' : 'false';

    const { error: upsertError } = await supabase
      .from('system_config')
      .upsert(
        { key: 'global_kill_switch', value },
        { onConflict: 'key' },
      );

    if (upsertError) {
      console.error('[KillSwitch:POST] Upsert error:', upsertError.message);
      return NextResponse.json({ error: `Failed to update kill switch: ${upsertError.message}` }, { status: 500 });
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      client_id: clientId,
      actor_type: 'user',
      actor_id: user.id,
      action: parsed.data.global ? 'kill_switch_activated' : 'kill_switch_deactivated',
      resource_type: 'system',
      resource_id: clientId,
      metadata: { previousState: !parsed.data.global, newState: parsed.data.global },
    });

    if (auditError) {
      console.error('[Audit] Failed to record kill switch change:', auditError.message);
    }

    return NextResponse.json({
      globalEnabled: parsed.data.global,
      message: parsed.data.global
        ? 'Global kill switch ACTIVATED — all pipeline execution halted'
        : 'Global kill switch DEACTIVATED — pipeline execution resumed',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[KillSwitch:POST] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
