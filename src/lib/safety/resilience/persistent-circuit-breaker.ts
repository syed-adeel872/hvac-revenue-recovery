import { SupabaseClient } from '@supabase/supabase-js';
import { CircuitState, CircuitBreakerSnapshot } from './types';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RECOVERY_TIMEOUT_MS = 30000;

export interface PersistentCircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
}

interface DBRow {
  id: string;
  client_id: string;
  state: CircuitState;
  failure_count: number;
  last_failure_time: string | null;
  updated_at: string;
}

export class PersistentCircuitBreaker {
  private readonly clientId: string;
  private readonly supabase: SupabaseClient;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;

  constructor(
    supabase: SupabaseClient,
    clientId: string,
    options: PersistentCircuitBreakerOptions = {},
  ) {
    this.supabase = supabase;
    this.clientId = clientId;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS;
  }

  private async loadState(): Promise<DBRow | null> {
    const { data, error } = await this.supabase
      .from('circuit_breaker_state')
      .select('id, client_id, state, failure_count, last_failure_time, updated_at')
      .eq('client_id', this.clientId)
      .single();

    if (error || !data) return null;
    return data as DBRow;
  }

  private async upsertState(
    state: CircuitState,
    failureCount: number,
    lastFailureTime: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('circuit_breaker_state')
      .upsert(
        {
          client_id: this.clientId,
          state,
          failure_count: failureCount,
          last_failure_time: lastFailureTime,
          updated_at: now,
        },
        { onConflict: 'client_id' },
      );

    if (error) {
      throw new Error(`Failed to persist circuit breaker state: ${error.message}`);
    }
  }

  async canExecute(): Promise<boolean> {
    const row = await this.loadState();
    if (!row) return true;

    if (row.state === 'CLOSED') return true;

    if (row.state === 'OPEN') {
      if (row.last_failure_time) {
        const elapsed = Date.now() - new Date(row.last_failure_time).getTime();
        if (elapsed >= this.recoveryTimeoutMs) {
          await this.upsertState('HALF_OPEN', row.failure_count, row.last_failure_time);
          return true;
        }
      }
      return false;
    }

    if (row.state === 'HALF_OPEN') return true;

    return false;
  }

  async recordSuccess(): Promise<void> {
    const row = await this.loadState();
    if (!row) return;

    if (row.state === 'HALF_OPEN') {
      await this.upsertState('CLOSED', 0, null);
    } else if (row.state === 'CLOSED') {
      await this.upsertState('CLOSED', 0, row.last_failure_time);
    }
  }

  async recordFailure(): Promise<void> {
    const row = await this.loadState();
    const newCount = (row?.failure_count ?? 0) + 1;
    const now = new Date().toISOString();

    let newState: CircuitState = 'CLOSED';
    if (row?.state === 'HALF_OPEN') {
      newState = 'OPEN';
    } else if (newCount >= this.failureThreshold) {
      newState = 'OPEN';
    } else {
      newState = 'CLOSED';
    }

    await this.upsertState(newState, newCount, now);
  }

  async getState(): Promise<CircuitBreakerSnapshot> {
    const row = await this.loadState();
    return {
      state: row?.state ?? 'CLOSED',
      failureCount: row?.failure_count ?? 0,
      lastFailureTime: row?.last_failure_time
        ? new Date(row.last_failure_time).getTime()
        : null,
    };
  }

  async reset(): Promise<void> {
    await this.upsertState('CLOSED', 0, null);
  }
}
