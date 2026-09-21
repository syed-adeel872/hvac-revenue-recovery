import { SupabaseClient } from '@supabase/supabase-js';
import { SafetyEvaluationContext, SafetyResult } from './types';
import { checkConsentStatus, checkOptOutStatus, checkOptOutKeywords } from './consent-checker';
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

    if (consent.status === 'pending') {
      result.decision = 'ESCALATE';
      result.reason = 'Consent status is pending — not yet granted';
      result.rules.push('consent_pending');
      return result;
    }

    const optOutStatus = await checkOptOutStatus(supabase, context.clientId, context.customerId);
    if (optOutStatus) {
      result.decision = 'BLOCK';
      result.reason = 'Customer has opted out';
      result.rules.push('opt_out');
      return result;
    }

    const messageContent = context.metadata?.messageContent as string | undefined;
    if (messageContent) {
      const words = messageContent.trim().toLowerCase().split(/\s+/);
      for (const word of words) {
        const match = await checkOptOutKeywords(supabase, context.clientId, word, context.channel);
        if (match) {
          result.decision = 'BLOCK';
          result.reason = `Message contains configured opt-out keyword: "${match.keyword}"`;
          result.rules.push('opt_out_keyword');
          return result;
        }
      }
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
