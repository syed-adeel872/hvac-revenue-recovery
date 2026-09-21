import { SupabaseClient } from '@supabase/supabase-js';

const CRON_SYSTEM_USER_ID = 'cron-system';

export async function resolveClientId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: member, error: memberError } = await supabase
    .from('client_members')
    .select('client_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    console.error(`[Tenant] Query error for user ${userId}:`, memberError.message, memberError.code);
  }

  if (member?.client_id) {
    const { data: clientExists } = await supabase
      .from('clients')
      .select('id')
      .eq('id', member.client_id)
      .eq('status', 'active')
      .maybeSingle();

    if (clientExists?.id) {
      return clientExists.id;
    }

    console.warn(`[Tenant] Membership found for client ${member.client_id} but client row missing — re-provisioning`);
  }

  if (userId === CRON_SYSTEM_USER_ID) {
    const { data: firstClient } = await supabase
      .from('clients')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstClient?.id) {
      return firstClient.id;
    }
  }

  console.error(`[Tenant] No active tenant association for user ${userId} — denying access`);
  throw new Error('Unauthorized: No tenant association. Contact your administrator to request access.');
}
