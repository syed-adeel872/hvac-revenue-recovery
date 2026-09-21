import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockVerifyAuthOrCron = vi.fn();
vi.mock('@/lib/auth', () => ({
  verifyAuthOrCron: (...args: any[]) => mockVerifyAuthOrCron(...args),
  verifyAuth: (...args: any[]) => mockVerifyAuthOrCron(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ count: 0 }),
      }),
    }),
  }),
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ data: [], error: null }),
    }),
  }),
}));

vi.mock('@/lib/safety/resilience/kill-switch', () => ({
  checkGlobalKillSwitch: vi.fn().mockResolvedValue({ enabled: false }),
  checkKillSwitch: vi.fn().mockResolvedValue({ enabled: false }),
}));

import { GET as statsGET } from '@/app/api/v1/admin/stats/route';
import { GET as actionsGET } from '@/app/api/v1/admin/actions/route';
import { POST as killSwitchPOST } from '@/app/api/v1/admin/kill-switch/route';
import { GET as credentialsGET } from '@/app/api/v1/admin/credentials/route';

describe('Admin API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/stats', () => {
    it('returns 401 when auth fails', async () => {
      mockVerifyAuthOrCron.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/v1/admin/stats');
      const res = await statsGET(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/v1/admin/actions', () => {
    it('returns 401 when auth fails', async () => {
      mockVerifyAuthOrCron.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/v1/admin/actions');
      const res = await actionsGET(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('POST /api/v1/admin/kill-switch', () => {
    it('returns 401 when auth fails', async () => {
      mockVerifyAuthOrCron.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/v1/admin/kill-switch', {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      });
      const res = await killSwitchPOST(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/v1/admin/credentials', () => {
    it('returns 401 when auth fails', async () => {
      mockVerifyAuthOrCron.mockResolvedValue(null);

      const req = new NextRequest('http://localhost/api/v1/admin/credentials');
      const res = await credentialsGET(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });
});
