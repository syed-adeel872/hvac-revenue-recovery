import { SupabaseClient } from '@supabase/supabase-js';
import { ClientPolicy, SafetyDecision } from './types';

export async function loadClientPolicies(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientPolicy[]> {
  try {
    const { data, error } = await supabase
      .from('worker_authorizations')
      .select('id, worker_type, scope, metadata, status')
      .eq('client_id', clientId)
      .eq('worker_type', 'safety')
      .eq('status', 'active');

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: `safety_${row.worker_type}`,
      type: 'worker_auth',
      decision: 'ALLOW' as SafetyDecision,
      priority: 100,
      enabled: true,
      config: {
        scope: row.scope,
        metadata: row.metadata,
      },
    }));
  } catch {
    return [];
  }
}

export function evaluateRateLimit(
  messagesSent: number,
  maxPerHour: number
): SafetyDecision {
  if (messagesSent >= maxPerHour) return 'BLOCK';
  if (messagesSent >= maxPerHour * 0.8) return 'ESCALATE';
  return 'ALLOW';
}
