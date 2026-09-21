import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordOptOut, checkOptOutStatus } from '@/lib/safety/consent-checker';

function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
  };

  return {
    from: vi.fn(() => mockChain),
    _mockChain: mockChain,
  };
}

describe('recordOptOut', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockSupabase._mockChain.upsert.mockResolvedValue({ error: null });
  });

  it('records opt-out for SMS channel', async () => {
    await recordOptOut(mockSupabase as any, 'client-1', 'customer-1', 'sms');

    expect(mockSupabase.from).toHaveBeenCalledWith('consents');
    expect(mockSupabase._mockChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-1',
        customer_id: 'customer-1',
        type: 'sms',
        status: 'revoked',
      }),
      { onConflict: 'client_id,customer_id,type' }
    );
  });

  it('records opt-out for email channel', async () => {
    await recordOptOut(mockSupabase as any, 'client-1', 'customer-1', 'email');

    expect(mockSupabase._mockChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'email',
        status: 'revoked',
      }),
      expect.any(Object)
    );
  });

  it('throws on upsert error', async () => {
    mockSupabase._mockChain.upsert.mockResolvedValue({
      error: { message: 'Database error' },
    });

    await expect(
      recordOptOut(mockSupabase as any, 'client-1', 'customer-1', 'sms')
    ).rejects.toThrow('Failed to record opt-out');
  });
});

describe('checkOptOutStatus', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  it('returns true when customer has opted out', async () => {
    mockSupabase._mockChain.maybeSingle.mockResolvedValue({
      data: { status: 'revoked' },
      error: null,
    });

    const result = await checkOptOutStatus(mockSupabase as any, 'client-1', 'customer-1');
    expect(result).toBe(true);
  });

  it('returns false when customer has not opted out', async () => {
    mockSupabase._mockChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await checkOptOutStatus(mockSupabase as any, 'client-1', 'customer-1');
    expect(result).toBe(false);
  });

  it('returns true (conservative) on error', async () => {
    mockSupabase._mockChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    });

    const result = await checkOptOutStatus(mockSupabase as any, 'client-1', 'customer-1');
    expect(result).toBe(true);
  });
});
