import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';

export interface AuthUser {
  id: string;
  email: string;
}

export async function verifyAuth(req: NextRequest): Promise<AuthUser | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return {
    id: user.id,
    email: user.email ?? '',
  };
}

export async function verifyAuthOrCron(req: NextRequest): Promise<AuthUser | null> {
  const authUser = await verifyAuth(req);
  if (authUser) return authUser;

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token.length !== cronSecret.length) return null;

  const { timingSafeEqual } = await import('crypto');
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(cronSecret);
  if (!timingSafeEqual(tokenBuf, secretBuf)) return null;

  return {
    id: 'cron-system',
    email: 'cron@system.local',
  };
}
