import { SupabaseClient } from '@supabase/supabase-js';

export async function transitionActionStatus(
  supabase: SupabaseClient,
  actionId: string,
  newStatus: string,
  workerId?: string,
  output?: Record<string, unknown>,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase.rpc('transition_action_status', {
    p_action_id: actionId,
    p_new_status: newStatus,
    p_worker_id: workerId ?? null,
    p_output: output ? JSON.stringify(output) : null,
    p_error_message: errorMessage ?? null,
  });

  if (error) {
    throw new Error(`Failed to transition action ${actionId} to ${newStatus}: ${error.message}`);
  }
}
