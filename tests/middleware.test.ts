import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('Middleware', () => {
  const middlewareContent = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'middleware.ts'),
    'utf8'
  );

  it('should include /api/generate-message in public route bypass', () => {
    expect(middlewareContent).toMatch(/isGenerateMessageRoute/);
    expect(middlewareContent).toMatch(/api\/generate-message/);
    expect(middlewareContent).toMatch(/isPublicRoute.*isGenerateMessageRoute|isGenerateMessageRoute.*isPublicRoute/);
  });

  it('should block non-POST methods on webhook routes with 405', () => {
    expect(middlewareContent).toMatch(/isWebhookRoute.*request\.method\s*!==\s*'POST'|request\.method\s*!==\s*'POST'.*isWebhookRoute/);
    expect(middlewareContent).toMatch(/status:\s*405/);
    expect(middlewareContent).toMatch(/Method not allowed/);
  });

  it('should inject x-request-id header for admin routes', () => {
    expect(middlewareContent).toMatch(/x-request-id/);
    expect(middlewareContent).toMatch(/\/api\/v1\/admin/);
    expect(middlewareContent).toMatch(/randomUUID/);
  });

  it('should still redirect unauthenticated users to /login', () => {
    expect(middlewareContent).toMatch(/pathname\s*=\s*'\/login'/);
    expect(middlewareContent).toMatch(/NextResponse\.redirect/);
  });

  it('should redirect authenticated users away from /login', () => {
    expect(middlewareContent).toMatch(/pathname\s*=\s*'\/'/);
    expect(middlewareContent).toMatch(/user && isLoginRoute/);
  });

  it('should keep Supabase cookie refresh logic', () => {
    expect(middlewareContent).toMatch(/createServerClient/);
    expect(middlewareContent).toMatch(/supabase\.auth\.getUser/);
    expect(middlewareContent).toMatch(/supabaseResponse\.cookies\.set/);
  });
});
