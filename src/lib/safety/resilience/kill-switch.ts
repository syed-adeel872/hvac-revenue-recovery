import { SupabaseClient } from '@supabase/supabase-js';
import { KillSwitchResult } from './types';

export async function checkGlobalKillSwitch(
  supabase: SupabaseClient,
): Promise<KillSwitchResult> {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'global_kill_switch')
      .single();

    if (error) {
      return { enabled: true, reason: 'Failed to check global kill switch status' };
    }

    if (data && data.value === 'true') {
      return { enabled: true, reason: 'Global kill switch is activated' };
    }

    return { enabled: false };
  } catch {
    return { enabled: true, reason: 'Global kill switch check failed - defaulting to blocked' };
  }
}

export async function checkKillSwitch(
  supabase: SupabaseClient,
  clientId: string,
): Promise<KillSwitchResult> {
  const global = await checkGlobalKillSwitch(supabase);
  if (global.enabled) return global;

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('kill_switch_enabled')
      .eq('id', clientId)
      .single();

    if (error) {
      console.error('[KillSwitch] clients query error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }));
      return { enabled: true, reason: `Failed to check kill switch status: ${error.message}` };
    }

    if (!data) {
      return { enabled: true, reason: 'Client not found' };
    }

    if (data.kill_switch_enabled === true) {
      return { enabled: true, reason: 'Kill switch is activated for this tenant' };
    }

    return { enabled: false };
  } catch (e) {
    console.error('[KillSwitch] checkKillSwitch exception:', e instanceof Error ? e.message : 'Unknown error');
    return { enabled: true, reason: 'Kill switch check failed - defaulting to blocked' };
  }
}
