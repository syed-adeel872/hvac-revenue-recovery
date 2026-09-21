import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyAuthOrCron } from '@/lib/auth';
import { resolveClientId } from '@/lib/admin-tenant';

export async function GET(req: NextRequest) {
  const user = await verifyAuthOrCron(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const clientId = await resolveClientId(supabase, user.id);

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: customers, error: customerError, count } = await supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (customerError) {
      console.error('[Customers] Query error:', customerError.message, customerError.code);
      return NextResponse.json({ error: `Failed to fetch customers: ${customerError.message}` }, { status: 500 });
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        customers: [],
        total: count || 0,
        page,
        pageSize,
        totalPages: 0,
      });
    }

    const customerIds = customers.map((c) => c.id);

    const [
      { data: estimates, error: estError },
      { data: bookings, error: bkError },
      { data: actions, error: actError },
    ] = await Promise.all([
      supabase
        .from('estimates')
        .select('customer_id, total_amount, status')
        .eq('client_id', clientId)
        .in('customer_id', customerIds),
      supabase
        .from('bookings')
        .select('customer_id, revenue_amount, status')
        .eq('client_id', clientId)
        .in('customer_id', customerIds),
      supabase
        .from('actions')
        .select('customer_id, status, action_type, created_at')
        .eq('client_id', clientId)
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false }),
    ]);

    if (estError) console.warn('[Customers] Estimates query failed:', estError.message);
    if (bkError) console.warn('[Customers] Bookings query failed:', bkError.message);
    if (actError) console.warn('[Customers] Actions query failed:', actError.message);

    const enriched = customers.map((customer) => {
      const customerEstimates = (estimates || []).filter((e) => e.customer_id === customer.id);
      const customerBookings = (bookings || []).filter((b) => b.customer_id === customer.id);
      const customerActions = (actions || []).filter((a) => a.customer_id === customer.id);

      const totalEstimateValue = customerEstimates.reduce(
        (sum, e) => sum + (Number(e.total_amount) || 0),
        0
      );
      const totalRecovered = customerBookings
        .filter((b) => b.status === 'completed')
        .reduce((sum, b) => sum + (Number(b.revenue_amount) || 0), 0);

      const lastAction = customerActions[0];
      const lastContact = lastAction?.created_at || null;

      const pendingCount = customerActions.filter(
        (a) => a.status === 'pending' || a.status === 'approved'
      ).length;

      return {
        id: customer.id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        city: customer.city,
        state: customer.state,
        tags: customer.tags || [],
        createdAt: customer.created_at,
        estimateCount: customerEstimates.length,
        totalEstimateValue,
        totalRecovered,
        lastContact,
        pendingActions: pendingCount,
      };
    });

    return NextResponse.json({
      customers: enriched,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Customers] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
