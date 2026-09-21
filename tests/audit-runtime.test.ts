import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockUser, MOCK_CLIENT_ID, MOCK_ACTION_ID, mockVerifyAuth, mockAuditInsert, mockUpsertResult, mockUpdateResult, mockActionData } = vi.hoisted(() => ({
  mockUser: { id: 'user-001', email: 'admin@test.com' },
  MOCK_CLIENT_ID: 'client-001',
  MOCK_ACTION_ID: 'action-001',
  mockVerifyAuth: vi.fn(),
  mockAuditInsert: vi.fn().mockResolvedValue({ error: null }),
  mockUpsertResult: vi.fn().mockResolvedValue({ error: null }),
  mockUpdateResult: vi.fn().mockResolvedValue({ error: null }),
  mockActionData: { id: 'action-001', status: 'pending', approval_required: true, client_id: 'client-001' },
}));

vi.mock('@/lib/auth', () => ({
  verifyAuthOrCron: (...args: any[]) => mockVerifyAuth(...args),
  verifyAuth: (...args: any[]) => mockVerifyAuth(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      if (table === 'client_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'owner' }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'actions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockActionData, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue(mockUpdateResult),
              }),
            }),
          }),
        };
      }
      if (table === 'system_config') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          upsert: mockUpsertResult,
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }),
  }),
}));

vi.mock('@/lib/admin-tenant', () => ({
  resolveClientId: vi.fn().mockResolvedValue(MOCK_CLIENT_ID),
}));

import { POST as actionPOST } from '@/app/api/v1/admin/actions/[actionId]/route';
import { POST as killSwitchPOST } from '@/app/api/v1/admin/kill-switch/route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('Approval Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(mockUser);
  });

  it('approve action inserts into audit_logs with correct columns', async () => {
    const req = makeReq({ decision: 'approve' });
    const res = await actionPOST(req, { params: Promise.resolve({ actionId: MOCK_ACTION_ID }) });
    expect(res.status).toBe(200);

    expect(mockAuditInsert).toHaveBeenCalledOnce();
    const p = mockAuditInsert.mock.calls[0][0];
    expect(p.client_id).toBe(MOCK_CLIENT_ID);
    expect(p.actor_type).toBe('user');
    expect(p.actor_id).toBe(mockUser.id);
    expect(p.action).toBe('action_approved');
    expect(p.resource_type).toBe('action');
    expect(p.resource_id).toBe(MOCK_ACTION_ID);
    expect(p.metadata).toEqual({ decision: 'approve' });
  });

  it('reject action inserts into audit_logs with rejection reason', async () => {
    const req = makeReq({ decision: 'reject', rejectionReason: 'Not now' });
    const res = await actionPOST(req, { params: Promise.resolve({ actionId: MOCK_ACTION_ID }) });
    expect(res.status).toBe(200);

    expect(mockAuditInsert).toHaveBeenCalledOnce();
    const p = mockAuditInsert.mock.calls[0][0];
    expect(p.action).toBe('action_rejected');
    expect(p.metadata).toEqual({ decision: 'reject', rejectionReason: 'Not now' });
  });

  it('audit insert failure does not block approval response', async () => {
    mockAuditInsert.mockResolvedValueOnce({ error: { message: 'table not found' } });
    const req = makeReq({ decision: 'approve' });
    const res = await actionPOST(req, { params: Promise.resolve({ actionId: MOCK_ACTION_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');
  });

  it('unauthorized user gets 401 and no audit insert', async () => {
    mockVerifyAuth.mockResolvedValue(null);
    const req = makeReq({ decision: 'approve' });
    const res = await actionPOST(req, { params: Promise.resolve({ actionId: MOCK_ACTION_ID }) });
    expect(res.status).toBe(401);
    expect(mockAuditInsert).not.toHaveBeenCalled();
  });

  it('action not found returns 404 and no audit insert', async () => {
    const originalFrom = (await import('@/lib/supabase/server')).createAdminClient;
    const mockAdmin = await originalFrom();
    const originalFromFn = mockAdmin.from;
    (mockAdmin as any).from = vi.fn((table: string) => {
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      if (table === 'actions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
              }),
            }),
          }),
        };
      }
      return originalFromFn(table);
    });

    const req = makeReq({ decision: 'approve' });
    const res = await actionPOST(req, { params: Promise.resolve({ actionId: 'nonexistent' }) });
    expect(res.status).toBe(404);
    expect(mockAuditInsert).not.toHaveBeenCalled();
  });
});

describe('Kill Switch Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(mockUser);
  });

  it('activation inserts kill_switch_activated into audit_logs', async () => {
    const req = makeReq({ global: true });
    const res = await killSwitchPOST(req);
    expect(res.status).toBe(200);

    expect(mockAuditInsert).toHaveBeenCalledOnce();
    const p = mockAuditInsert.mock.calls[0][0];
    expect(p.client_id).toBe(MOCK_CLIENT_ID);
    expect(p.actor_type).toBe('user');
    expect(p.actor_id).toBe(mockUser.id);
    expect(p.action).toBe('kill_switch_activated');
    expect(p.resource_type).toBe('system');
    expect(p.metadata).toEqual({ previousState: false, newState: true });
  });

  it('deactivation inserts kill_switch_deactivated into audit_logs', async () => {
    const req = makeReq({ global: false, confirmation: 'DISABLE' });
    const res = await killSwitchPOST(req);
    expect(res.status).toBe(200);

    expect(mockAuditInsert).toHaveBeenCalledOnce();
    const p = mockAuditInsert.mock.calls[0][0];
    expect(p.action).toBe('kill_switch_deactivated');
    expect(p.metadata).toEqual({ previousState: true, newState: false });
  });

  it('audit insert failure does not block kill switch response', async () => {
    mockAuditInsert.mockResolvedValueOnce({ error: { message: 'table not found' } });
    const req = makeReq({ global: true });
    const res = await killSwitchPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.globalEnabled).toBe(true);
  });

  it('unauthorized user gets 401 and no audit insert', async () => {
    mockVerifyAuth.mockResolvedValue(null);
    const req = makeReq({ global: true });
    const res = await killSwitchPOST(req);
    expect(res.status).toBe(401);
    expect(mockAuditInsert).not.toHaveBeenCalled();
  });

  it('invalid input gets 400 and no audit insert', async () => {
    const req = makeReq({ global: 'not-a-boolean' });
    const res = await killSwitchPOST(req);
    expect(res.status).toBe(400);
    expect(mockAuditInsert).not.toHaveBeenCalled();
  });
});
