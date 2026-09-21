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
    const clientId = await resolveClientId(supabase, user.id);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'pending';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: actions, error: actionsError, count } = await supabase
      .from('actions')
      .select(`
        id, client_id, customer_id, conversation_id, estimate_id,
        worker_type, action_type, risk_level, status, approval_required,
        approved_by, approved_at, rejection_reason,
        input, output, created_at, updated_at
      `, { count: 'exact' })
      .eq('client_id', clientId)
      .eq('status', status)
      .eq('approval_required', true)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (actionsError) {
      return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 });
    }

    const customerIds = [...new Set((actions || []).map((a: any) => a.customer_id).filter(Boolean))];

    let customers: any[] = [];
    if (customerIds.length > 0) {
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .in('id', customerIds)
        .eq('client_id', clientId);
      customers = data || [];
    }

    const customerMap = new Map(customers.map((c: any) => [c.id, c]));

    const enriched = (actions || []).map((action: any) => {
      const customer = action.customer_id ? customerMap.get(action.customer_id) : null;
      return {
        id: action.id,
        clientId: action.client_id,
        customerId: action.customer_id,
        customerName: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
        customerEmail: customer?.email,
        customerPhone: customer?.phone,
        workerType: action.worker_type,
        actionType: action.action_type,
        riskLevel: action.risk_level,
        status: action.status,
        approvalRequired: action.approval_required,
        approvedBy: action.approved_by,
        approvedAt: action.approved_at,
        rejectionReason: action.rejection_reason,
        input: action.input,
        output: action.output,
        createdAt: action.created_at,
        updatedAt: action.updated_at,
      };
    });

    return NextResponse.json({
      actions: enriched,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Actions] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
