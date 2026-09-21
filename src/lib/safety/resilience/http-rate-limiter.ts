interface HttpRateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface HttpRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > 300000) {
      store.delete(key);
    }
  }
}

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60000;

export function checkHttpRateLimit(
  key: string,
  config: HttpRateLimitConfig,
): HttpRateLimitResult {
  const now = Date.now();

  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries();
    lastCleanup = now;
  }

  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      retryAfterMs: 0,
    };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    retryAfterMs: 0,
  };
}

export function resetHttpRateLimit(key: string): void {
  store.delete(key);
}

export function resetAllHttpRateLimits(): void {
  store.clear();
}

export function getHttpRateLimitStore(): Map<string, RateLimitEntry> {
  return store;
}

export type { HttpRateLimitConfig, HttpRateLimitResult };
