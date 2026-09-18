export type SafetyDecision = 'ALLOW' | 'BLOCK' | 'ESCALATE';

export interface SafetyEvaluationContext {
  clientId: string;
  customerId: string;
  channel: 'sms' | 'email' | 'phone_call';
  actionType: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface ConsentStatus {
  status: 'granted' | 'revoked' | 'pending' | 'unknown';
  expiresAt: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
}

export interface OptOutKeyword {
  id: string;
  keyword: string;
  channel: string;
}

export interface SafetyResult {
  decision: SafetyDecision;
  reason: string;
  rules: string[];
  evaluatedAt: Date;
}

export interface ClientPolicy {
  id: string;
  name: string;
  type: string;
  decision: SafetyDecision;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
}
