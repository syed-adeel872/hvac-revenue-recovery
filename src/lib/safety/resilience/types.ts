export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface KillSwitchResult {
  enabled: boolean;
  reason?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
  window: 'hourly' | 'daily';
}

export interface RateLimitOptions {
  hourly?: number;
  daily?: number;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
}

export interface CircuitBreakerSnapshot {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
}

export interface ResilienceCheckResult {
  killSwitch: KillSwitchResult;
  rateLimit: RateLimitResult | null;
  circuitBreaker: CircuitBreakerSnapshot;
  allowed: boolean;
  blockReason?: string;
}
