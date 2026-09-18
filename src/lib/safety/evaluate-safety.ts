import { SupabaseClient } from '@supabase/supabase-js';
import { SafetyEvaluationContext, SafetyResult } from './types';
import { checkConsentStatus } from './consent-checker';
import { loadClientPolicies } from './policy-engine';

export async function evaluateSafety(
  supabase: SupabaseClient,
  context: SafetyEvaluationContext
): Promise<SafetyResult> {
  const result: SafetyResult = {
    decision: 'ALLOW',
    reason: '',
    rules: [],
    evaluatedAt: new Date(),
  };

  try {
    const consent = await checkConsentStatus(
      supabase,
      context.clientId,
      context.customerId,
      context.channel
    );

    if (!consent) {
      result.decision = 'ESCALATE';
      result.reason = 'Consent status could not be determined';
      result.rules.push('consent_not_found');
      return result;
    }

    if (consent.status === 'revoked') {
      result.decision = 'BLOCK';
      result.reason = 'Consent has been revoked';
      result.rules.push('consent_revoked');
      return result;
    }
    if (consent.status === 'unknown') {
      result.decision = 'ESCALATE';
      result.reason = 'Consent status is unknown';
      result.rules.push('consent_unknown');
      return result;
    }
    if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
      result.decision = 'BLOCK';
      result.reason = 'Consent has expired';
      result.rules.push('consent_expired');
      return result;
    }

    const policies = await loadClientPolicies(supabase, context.clientId);
    for (const policy of policies) {
      if (!policy.enabled) continue;
      if (policy.type === 'worker_auth' && policy.decision !== 'ALLOW') {
        result.decision = policy.decision;
        result.reason = `Client policy ${policy.name} triggered`;
        result.rules.push(policy.id);
        return result;
      }
    }

    return result;
  } catch (error) {
    result.decision = 'BLOCK';
    result.reason = 'Safety evaluation failed — defaulting to BLOCK';
    result.rules.push('evaluation_error');
    return result;
  }
}
