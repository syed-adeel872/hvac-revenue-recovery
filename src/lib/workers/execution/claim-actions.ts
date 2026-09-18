import { SupabaseClient } from '@supabase/supabase-js';
import { ClaimedRecoveryAction } from './types';

export async function claimRecoveryActions(
  supabase: SupabaseClient,
  clientId: string,
  limit: number = 10,
): Promise<ClaimedRecoveryAction[]> {
  const { data: actions, error: queryError } = await supabase
    .from('actions')
    .select('*')
    .eq('client_id', clientId)
    .eq('worker_type', 'recovery')
    .eq('action_type', 'draft_response')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (queryError) {
    throw new Error(`Failed to query recovery actions: ${queryError.message}`);
  }

  if (!actions || actions.length === 0) {
    return [];
  }

  const claimed: ClaimedRecoveryAction[] = [];

  for (const action of actions) {
    const { data: updated, error: updateError } = await supabase
      .from('actions')
      .update({
        status: 'executing',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', action.id)
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .select()
      .single();

    if (updateError || !updated) {
      continue;
    }

    claimed.push(updated as unknown as ClaimedRecoveryAction);
  }

  return claimed;
}
