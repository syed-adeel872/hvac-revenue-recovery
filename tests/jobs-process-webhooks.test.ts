import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/v1/jobs/process-webhooks/route';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/webhook/processor', () => ({
  processBatchOnce: vi.fn(),
}));

const mockSupabase = {};

function createRequest(options: { authorization?: string; batch_size?: string } = {}) {
  const headers = new Headers();
  if (options.authorization !== undefined) {
    headers.set('authorization', options.authorization);
  }
  const url = new URL('http://localhost:3000/api/v1/jobs/process-webhooks');
  if (options.batch_size) {
    url.searchParams.set('batch_size', options.batch_size);
  }
  return new Request(url.toString(), { method: 'POST', headers });
}

describe('POST /api/v1/jobs/process-webhooks', () => {
  const originalEnv = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret-123';
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  it('returns 401 when authorization header is missing', async () => {
    const request = createRequest();
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Missing authorization header');
  });

  it('returns 401 when authorization header does not start with Bearer', async () => {
    const request = createRequest({ authorization: 'Basic test-secret-123' });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Missing authorization header');
  });

  it('returns 401 when authorization token is invalid', async () => {
    const request = createRequest({ authorization: 'Bearer wrong-secret' });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid authorization token');
  });

  it('returns 200 with execution summary on valid secret', async () => {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const { processBatchOnce } = await import('@/lib/webhook/processor');

    (createAdminClient as any).mockResolvedValue(mockSupabase);
    (processBatchOnce as any).mockResolvedValue({
      total: 5,
      succeeded: 4,
      failed: 1,
      retried: 0,
    });

    const request = createRequest({ authorization: 'Bearer test-secret-123' });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.claimed).toBe(5);
    expect(body.processed).toBe(4);
    expect(body.failed).toBe(1);
    expect(body.retried).toBe(0);
    expect(body.timestamp).toBeDefined();
  });

  it('passes batch_size query parameter to processor', async () => {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const { processBatchOnce } = await import('@/lib/webhook/processor');

    (createAdminClient as any).mockResolvedValue(mockSupabase);
    (processBatchOnce as any).mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
    });

    const request = createRequest({ authorization: 'Bearer test-secret-123', batch_size: '25' });
    await POST(request as any);

    expect(processBatchOnce).toHaveBeenCalledWith({
      supabase: mockSupabase,
      config: { batchSize: 25, pollIntervalMs: 0 },
    });
  });

  it('returns 400 for invalid batch_size', async () => {
    const request = createRequest({ authorization: 'Bearer test-secret-123', batch_size: '7' });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid batch_size');
  });

  it('returns 500 when processor throws an error', async () => {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const { processBatchOnce } = await import('@/lib/webhook/processor');

    (createAdminClient as any).mockResolvedValue(mockSupabase);
    (processBatchOnce as any).mockRejectedValue(new Error('DB connection failed'));

    const request = createRequest({ authorization: 'Bearer test-secret-123' });
    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Processor failed');
  });
});
