import { SupabaseClient } from '@supabase/supabase-js';
import { KillSwitchResult } from './types';

export async function checkKillSwitch(
  supabase: SupabaseClient,
  clientId: string,
): Promise<KillSwitchResult> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('kill_switch_enabled')
      .eq('id', clientId)
      .single();

    if (error) {
      return { enabled: true, reason: 'Failed to check kill switch status' };
    }

    if (!data) {
      return { enabled: true, reason: 'Client not found' };
    }

    if (data.kill_switch_enabled === true) {
      return { enabled: true, reason: 'Kill switch is activated for this tenant' };
    }

    return { enabled: false };
  } catch {
    return { enabled: true, reason: 'Kill switch check failed - defaulting to blocked' };
  }
}
