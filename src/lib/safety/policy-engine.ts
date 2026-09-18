import { SupabaseClient } from '@supabase/supabase-js';
import { ClientPolicy, SafetyDecision } from './types';

export async function loadClientPolicies(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientPolicy[]> {
  const { data, error } = await supabase
    .from('worker_authorizations')
    .select('id, worker_type, scope, metadata, status')
    .eq('client_id', clientId)
    .eq('worker_type', 'safety')
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to load client policies: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: `safety_${row.worker_type}`,
    type: 'worker_auth',
    decision: deriveDecisionFromScope(row.scope),
    priority: 100,
    enabled: true,
    config: {
      scope: row.scope,
      metadata: row.metadata,
    },
  }));
}

function deriveDecisionFromScope(scope: string | null): SafetyDecision {
  if (!scope) return 'ESCALATE';
  const normalized = scope.toLowerCase().trim();
  if (normalized === 'full' || normalized === 'all' || normalized === 'allow') {
    return 'ALLOW';
  }
  if (normalized === 'deny' || normalized === 'block' || normalized === 'restricted') {
    return 'BLOCK';
  }
  return 'ESCALATE';
}

export function evaluateRateLimit(
  messagesSent: number,
  maxPerHour: number
): SafetyDecision {
  if (messagesSent >= maxPerHour) return 'BLOCK';
  if (messagesSent >= maxPerHour * 0.8) return 'ESCALATE';
  return 'ALLOW';
}
