import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateSafety } from '@/lib/safety/evaluate-safety';
import { checkConsentStatus, checkOptOutKeywords } from '@/lib/safety/consent-checker';
import { loadClientPolicies } from '@/lib/safety/policy-engine';
import { evaluateRateLimit } from '@/lib/safety/policy-engine';

vi.mock('@/lib/safety/consent-checker', () => ({
  checkConsentStatus: vi.fn(),
  checkOptOutKeywords: vi.fn(),
}));

vi.mock('@/lib/safety/policy-engine', async () => {
  const actual = await vi.importActual('@/lib/safety/policy-engine');
  return {
    ...actual,
    loadClientPolicies: vi.fn(),
  };
});

const mockSupabase = {};

const baseContext = {
  clientId: 'client-1',
  customerId: 'customer-1',
  channel: 'sms' as const,
  actionType: 'send_followup',
};

describe('evaluateSafety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ALLOW when all checks pass', async () => {
    (checkConsentStatus as any).mockResolvedValue({
      status: 'granted',
      expiresAt: null,
      grantedAt: '2024-01-01T00:00:00Z',
      revokedAt: null,
    });
    (loadClientPolicies as any).mockResolvedValue([]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('ALLOW');
    expect(result.reason).toBe('');
    expect(result.rules).toEqual([]);
  });

  it('returns BLOCK when consent is revoked', async () => {
    (checkConsentStatus as any).mockResolvedValue({
      status: 'revoked',
      expiresAt: null,
      grantedAt: '2024-01-01T00:00:00Z',
      revokedAt: '2024-06-01T00:00:00Z',
    });
    (loadClientPolicies as any).mockResolvedValue([]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toBe('Consent has been revoked');
    expect(result.rules).toContain('consent_revoked');
  });

  it('returns ESCALATE when consent status is unknown', async () => {
    (checkConsentStatus as any).mockResolvedValue({
      status: 'unknown',
      expiresAt: null,
      grantedAt: null,
      revokedAt: null,
    });
    (loadClientPolicies as any).mockResolvedValue([]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('ESCALATE');
    expect(result.reason).toBe('Consent status is unknown');
    expect(result.rules).toContain('consent_unknown');
  });

  it('returns BLOCK when consent has expired', async () => {
    vi.setSystemTime(new Date('2024-12-01T00:00:00Z'));

    (checkConsentStatus as any).mockResolvedValue({
      status: 'granted',
      expiresAt: '2024-06-01T00:00:00Z',
      grantedAt: '2024-01-01T00:00:00Z',
      revokedAt: null,
    });
    (loadClientPolicies as any).mockResolvedValue([]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toBe('Consent has expired');
    expect(result.rules).toContain('consent_expired');
  });

  it('returns ESCALATE when consent is null (missing record)', async () => {
    (checkConsentStatus as any).mockResolvedValue(null);
    (loadClientPolicies as any).mockResolvedValue([]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('ESCALATE');
    expect(result.reason).toBe('Consent status could not be determined');
    expect(result.rules).toContain('consent_not_found');
  });

  it('returns BLOCK on evaluation error (fail-safe)', async () => {
    (checkConsentStatus as any).mockRejectedValue(new Error('DB connection failed'));

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toBe('Safety evaluation failed — defaulting to BLOCK');
    expect(result.rules).toContain('evaluation_error');
  });

  it('enforces tenant isolation', async () => {
    (checkConsentStatus as any).mockResolvedValue(null);
    (loadClientPolicies as any).mockResolvedValue([]);

    await evaluateSafety(mockSupabase as any, baseContext);

    expect(checkConsentStatus).toHaveBeenCalledWith(
      mockSupabase,
      'client-1',
      'customer-1',
      'sms'
    );
  });

  it('evaluates client policies correctly', async () => {
    (checkConsentStatus as any).mockResolvedValue({
      status: 'granted',
      expiresAt: null,
      grantedAt: '2024-01-01T00:00:00Z',
      revokedAt: null,
    });
    (loadClientPolicies as any).mockResolvedValue([
      {
        id: 'policy-1',
        name: 'safety_safety',
        type: 'worker_auth',
        decision: 'BLOCK',
        priority: 100,
        enabled: true,
        config: {},
      },
    ]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('BLOCK');
    expect(result.rules).toContain('policy-1');
  });

  it('skips disabled policies', async () => {
    (checkConsentStatus as any).mockResolvedValue({
      status: 'granted',
      expiresAt: null,
      grantedAt: '2024-01-01T00:00:00Z',
      revokedAt: null,
    });
    (loadClientPolicies as any).mockResolvedValue([
      {
        id: 'policy-1',
        name: 'safety_safety',
        type: 'worker_auth',
        decision: 'BLOCK',
        priority: 100,
        enabled: false,
        config: {},
      },
    ]);

    const result = await evaluateSafety(mockSupabase as any, baseContext);

    expect(result.decision).toBe('ALLOW');
    expect(result.rules).toEqual([]);
  });
});

describe('evaluateRateLimit', () => {
  it('returns ALLOW when under limit', () => {
    expect(evaluateRateLimit(3, 5)).toBe('ALLOW');
  });

  it('returns ESCALATE when near limit', () => {
    expect(evaluateRateLimit(4, 5)).toBe('ESCALATE');
  });

  it('returns BLOCK when at limit', () => {
    expect(evaluateRateLimit(5, 5)).toBe('BLOCK');
  });
});
