import { WebhookErrorCode, createError } from './errors';

export interface ReplayConfig {
  enabled: boolean;
  maxAgeSeconds: number;
  maxFutureSeconds: number;
}

export interface ReplayValidationResult {
  valid: boolean;
  error?: Error;
}

const DEFAULT_CONFIG: ReplayConfig = {
  enabled: true,
  maxAgeSeconds: 5 * 60,
  maxFutureSeconds: 60,
};

export function validateTimestamp(
  providerTimestamp: Date | undefined,
  config: Partial<ReplayConfig> = {}
): ReplayValidationResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!mergedConfig.enabled) {
    return { valid: true };
  }

  if (!providerTimestamp) {
    return { valid: true };
  }

  const now = new Date();
  const ageMs = now.getTime() - providerTimestamp.getTime();
  const ageSeconds = ageMs / 1000;

  if (ageSeconds > mergedConfig.maxAgeSeconds) {
    return {
      valid: false,
      error: createError(
        WebhookErrorCode.STALE_REQUEST,
        `Request timestamp is too old: ${Math.round(ageSeconds)}s > ${mergedConfig.maxAgeSeconds}s`,
        'Request timestamp is stale'
      ),
    };
  }

  const futureSeconds = -ageSeconds;
  if (futureSeconds > mergedConfig.maxFutureSeconds) {
    return {
      valid: false,
      error: createError(
        WebhookErrorCode.FUTURE_REQUEST,
        `Request timestamp is in the future: ${Math.round(futureSeconds)}s > ${mergedConfig.maxFutureSeconds}s`,
        'Request timestamp is in the future'
      ),
    };
  }

  return { valid: true };
}

export function createReplayConfig(providerConfig: {
  replay_protection_enabled?: boolean;
  max_age_seconds?: number;
  max_future_seconds?: number;
}): ReplayConfig {
  return {
    enabled: providerConfig.replay_protection_enabled ?? true,
    maxAgeSeconds: providerConfig.max_age_seconds ?? 300,
    maxFutureSeconds: providerConfig.max_future_seconds ?? 60,
  };
}