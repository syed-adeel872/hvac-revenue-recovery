import { Json } from '@/lib/supabase/types';
import { SafetyResult } from '@/lib/safety/types';
import { KillSwitchResult, RateLimitResult, CircuitBreakerSnapshot } from '@/lib/safety/resilience/types';

export interface ClaimedRecoveryAction {
  id: string;
  clientId: string;
  customerId: string | null;
  leadId: string | null;
  estimateId: string | null;
  conversationId: string | null;
  bookingId: string | null;
  workflowEventId: string | null;
  workerType: 'recovery';
  actionType: string;
  riskLevel: 'green' | 'yellow' | 'red';
  status: 'executing';
  input: Json;
  output: Json | null;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  metadata: Json;
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string | null;
}

export interface DispatchParams {
  channel: 'sms' | 'email';
  to: string;
  content: string;
  clientId: string;
  customerId: string;
  conversationId: string;
}

export interface DeliveryResult {
  success: boolean;
  externalId?: string;
  error?: string;
  errorCode?: string;
}

export interface DispatchResult {
  success: boolean;
  messageId?: string;
  externalId?: string;
  error?: string;
}

export interface ExecutionResult {
  actionId: string;
  status: 'completed' | 'failed' | 'rejected' | 'held';
  messageId?: string;
  externalId?: string;
  error?: string;
  safetyResult?: SafetyResult;
  killSwitch?: KillSwitchResult;
  rateLimit?: RateLimitResult;
  circuitBreaker?: CircuitBreakerSnapshot;
}

export interface ProcessBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  rejected: number;
  held: number;
  results: ExecutionResult[];
}

export interface ExecutionOptions {
  skipRateLimit?: boolean;
  skipCircuitBreaker?: boolean;
  rateLimitOptions?: { hourly?: number; daily?: number };
}
