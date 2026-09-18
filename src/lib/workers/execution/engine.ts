import { SupabaseClient } from '@supabase/supabase-js';
import { claimRecoveryActions } from './claim-actions';
import { dispatchMessage } from './dispatch';
import { MessagingAdapter } from './adapters';
import { checkKillSwitch } from '@/lib/safety/resilience/kill-switch';
import { checkRateLimit } from '@/lib/safety/resilience/rate-limiter';
import { CircuitBreaker } from '@/lib/safety/resilience/circuit-breaker';
import { evaluateSafety } from '@/lib/safety/evaluate-safety';
import {
  ClaimedRecoveryAction,
  ExecutionResult,
  ProcessBatchResult,
  ExecutionOptions,
} from './types';

const tenantCircuitBreakers = new Map<string, CircuitBreaker>();

function getTenantCircuitBreaker(clientId: string): CircuitBreaker {
  let cb = tenantCircuitBreakers.get(clientId);
  if (!cb) {
    cb = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeoutMs: 30000,
    });
    tenantCircuitBreakers.set(clientId, cb);
  }
  return cb;
}

function buildSafetyContext(action: ClaimedRecoveryAction) {
  const input = action.input as { channel?: string } | null;
  const channel = input?.channel === 'email' ? 'email' : 'sms';

  return {
    clientId: action.clientId,
    customerId: action.customerId ?? '',
    channel: channel as 'sms' | 'email',
    actionType: action.actionType,
  };
}

function extractPhoneEmail(output: Record<string, unknown> | null, input: Record<string, unknown> | null) {
  const channel = (input?.channel as string) ?? 'sms';
  const phone = input?.customerPhone as string | undefined;
  const email = input?.customerEmail as string | undefined;
  return { channel: channel as 'sms' | 'email', phone, email };
}

export async function markActionCompleted(
  supabase: SupabaseClient,
  actionId: string,
  clientId: string,
): Promise<void> {
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .eq('client_id', clientId)
    .eq('status', 'executing');

  if (error) {
    throw new Error(`Failed to mark action completed: ${error.message}`);
  }
}

export async function markActionFailed(
  supabase: SupabaseClient,
  actionId: string,
  clientId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .eq('client_id', clientId)
    .eq('status', 'executing');

  if (error) {
    throw new Error(`Failed to mark action failed: ${error.message}`);
  }
}

export async function markActionRejected(
  supabase: SupabaseClient,
  actionId: string,
  clientId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'rejected',
      completed_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .eq('client_id', clientId)
    .eq('status', 'executing');

  if (error) {
    throw new Error(`Failed to mark action rejected: ${error.message}`);
  }
}

export async function processRecoveryAction(
  supabase: SupabaseClient,
  action: ClaimedRecoveryAction,
  adapter: MessagingAdapter,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    actionId: action.id,
    status: 'failed',
  };

  if (!options.skipKillSwitch) {
    const killSwitch = await checkKillSwitch(supabase, action.clientId);
    result.killSwitch = killSwitch;
    if (killSwitch.enabled) {
      await markActionFailed(supabase, action.id, action.clientId, killSwitch.reason ?? 'Kill switch activated');
      result.error = killSwitch.reason ?? 'Kill switch activated';
      return result;
    }
  }

  try {
    const safetyContext = buildSafetyContext(action);
    const safetyResult = await evaluateSafety(supabase, safetyContext);
    result.safetyResult = safetyResult;

    if (safetyResult.decision === 'BLOCK') {
      await markActionRejected(supabase, action.id, action.clientId, safetyResult.reason);
      result.status = 'rejected';
      result.error = safetyResult.reason;
      return result;
    }

    if (safetyResult.decision === 'ESCALATE') {
      await markActionFailed(supabase, action.id, action.clientId, 'Safety escalation at dispatch');
      result.error = 'Safety escalation at dispatch';
      return result;
    }
  } catch {
    await markActionFailed(supabase, action.id, action.clientId, 'Safety evaluation failed');
    result.error = 'Safety evaluation failed';
    return result;
  }

  if (!options.skipRateLimit && action.customerId) {
    const output = action.output as { response?: string } | null;
    const input = action.input as { channel?: string } | null;
    const channel = (input?.channel as 'sms' | 'email') ?? 'sms';

    const rateLimit = await checkRateLimit(
      supabase,
      action.clientId,
      action.customerId,
      channel,
      options.rateLimitOptions,
    );
    result.rateLimit = rateLimit;

    if (!rateLimit.allowed) {
      await markActionFailed(supabase, action.id, action.clientId, rateLimit.reason ?? 'Rate limit exceeded');
      result.error = rateLimit.reason;
      return result;
    }
  }

  if (!options.skipCircuitBreaker) {
    const cb = getTenantCircuitBreaker(action.clientId);
    if (!cb.canExecute()) {
      const snapshot = cb.getState();
      result.circuitBreaker = snapshot;
      await markActionFailed(supabase, action.id, action.clientId, 'Circuit breaker is open');
      result.error = 'Circuit breaker is open';
      return result;
    }
  }

  try {
    const dispatchResult = await dispatchMessage(supabase, action, adapter);

    if (!dispatchResult.success) {
      getTenantCircuitBreaker(action.clientId).recordFailure();
      await markActionFailed(supabase, action.id, action.clientId, dispatchResult.error ?? 'Dispatch failed');
      result.error = dispatchResult.error;
      return result;
    }

    getTenantCircuitBreaker(action.clientId).recordSuccess();
    await markActionCompleted(supabase, action.id, action.clientId);
    result.status = 'completed';
    result.messageId = dispatchResult.messageId;
    result.externalId = dispatchResult.externalId;
    return result;
  } catch (error) {
    getTenantCircuitBreaker(action.clientId).recordFailure();
    const errorMsg = error instanceof Error ? error.message : 'Unknown dispatch error';
    await markActionFailed(supabase, action.id, action.clientId, errorMsg);
    result.error = errorMsg;
    return result;
  }
}

export async function processBatch(
  supabase: SupabaseClient,
  clientId: string,
  adapter: MessagingAdapter,
  options: ExecutionOptions & { batchSize?: number } = {},
): Promise<ProcessBatchResult> {
  const batchSize = options.batchSize ?? 10;
  const claimed = await claimRecoveryActions(supabase, clientId, batchSize);

  const results: ExecutionResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let rejected = 0;
  let held = 0;

  for (const action of claimed) {
    const result = await processRecoveryAction(supabase, action, adapter, options);
    results.push(result);

    switch (result.status) {
      case 'completed':
        succeeded++;
        break;
      case 'failed':
        failed++;
        break;
      case 'rejected':
        rejected++;
        break;
      case 'held':
        held++;
        break;
    }
  }

  return {
    total: claimed.length,
    succeeded,
    failed,
    rejected,
    held,
    results,
  };
}

export function getTenantCircuitBreakerForClient(clientId: string): CircuitBreaker {
  return getTenantCircuitBreaker(clientId);
}

export function resetTenantCircuitBreakers(): void {
  tenantCircuitBreakers.clear();
}
