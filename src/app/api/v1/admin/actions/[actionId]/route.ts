import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth';
import { resolveClientId } from '@/lib/admin-tenant';
import { z } from 'zod';

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  rejectionReason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { actionId } = await params;

  if (!actionId) {
    return NextResponse.json({ error: 'Action ID required' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { decision, rejectionReason } = parsed.data;

  if (decision === 'reject' && !rejectionReason) {
    return NextResponse.json(
      { error: 'Rejection reason is required' },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);

    const { data: action, error: fetchError } = await supabase
      .from('actions')
      .select('id, status, approval_required, client_id')
      .eq('id', actionId)
      .eq('client_id', clientId)
      .single();

    if (fetchError || !action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    if (action.status !== 'pending') {
      return NextResponse.json(
        { error: `Action is ${action.status}, not pending` },
        { status: 409 },
      );
    }

    if (!action.approval_required) {
      return NextResponse.json(
        { error: 'Action does not require approval' },
        { status: 409 },
      );
    }

    if (decision === 'approve') {
      const { error: updateError } = await supabase
        .from('actions')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', actionId)
        .eq('client_id', clientId)
        .eq('status', 'pending');

      if (updateError) {
        return NextResponse.json({ error: 'Failed to approve action' }, { status: 500 });
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        client_id: clientId,
        actor_type: 'user',
        actor_id: user.id,
        action: 'action_approved',
        resource_type: 'action',
        resource_id: actionId,
        metadata: { decision },
      });

      if (auditError) {
        console.error('[Audit] Failed to record action approval:', auditError.message);
      }

      return NextResponse.json({
        message: 'Action approved',
        actionId,
        status: 'approved',
        approvedBy: user.id,
        approvedAt: new Date().toISOString(),
      });
    } else {
      const { error: updateError } = await supabase
        .from('actions')
        .update({
          status: 'rejected',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', actionId)
        .eq('client_id', clientId)
        .eq('status', 'pending');

      if (updateError) {
        return NextResponse.json({ error: 'Failed to reject action' }, { status: 500 });
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        client_id: clientId,
        actor_type: 'user',
        actor_id: user.id,
        action: 'action_rejected',
        resource_type: 'action',
        resource_id: actionId,
        metadata: { decision, rejectionReason },
      });

      if (auditError) {
        console.error('[Audit] Failed to record action rejection:', auditError.message);
      }

      return NextResponse.json({
        message: 'Action rejected',
        actionId,
        status: 'rejected',
        rejectedBy: user.id,
        rejectedAt: new Date().toISOString(),
        rejectionReason,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ActionApproval] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
