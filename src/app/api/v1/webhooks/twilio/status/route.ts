import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { TwilioMessagingAdapter } from '@/lib/messaging/twilio';
import { checkHttpRateLimit } from '@/lib/safety/resilience/http-rate-limiter';

const WEBHOOK_BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const TWILIO_STATUS_MAP: Record<string, string> = {
  'queued': 'sent',
  'sent': 'sent',
  'delivered': 'delivered',
  'undelivered': 'failed',
  'failed': 'failed',
  'no-answer': 'failed',
  'busy': 'failed',
  'canceled': 'failed',
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
  const rl = checkHttpRateLimit(`twilio-status:${ip}`, { windowMs: 60000, maxRequests: 100 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  try {
    const rawBody = await request.text();
    const formData = new URLSearchParams(rawBody);

    if (!TWILIO_AUTH_TOKEN) {
      console.error('[Twilio Status] TWILIO_AUTH_TOKEN not configured — rejecting request');
      return new NextResponse('Server misconfiguration', { status: 500 });
    }

    const twilioSignature = request.headers.get('x-twilio-signature');
    const requestUrl = `${WEBHOOK_BASE_URL}/api/v1/webhooks/twilio/status`;

    if (!twilioSignature) {
      return new NextResponse('Missing Twilio signature', { status: 401 });
    }

    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    if (!TwilioMessagingAdapter.validateTwilioSignature(requestUrl, params, twilioSignature, TWILIO_AUTH_TOKEN)) {
      return new NextResponse('Invalid Twilio signature', { status: 401 });
    }

    const messageSid = formData.get('MessageSid') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const errorCode = formData.get('ErrorCode') as string;
    const errorMessage = formData.get('ErrorMessage') as string;

    if (!messageSid || !messageStatus) {
      return new NextResponse(null, { status: 200 });
    }

    const supabase = createAdminClient();

    const dbStatus = TWILIO_STATUS_MAP[messageStatus] || 'failed';

    const updateData: Record<string, unknown> = {
      status: dbStatus,
      updated_at: new Date().toISOString(),
    };

    if (dbStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    }

    if (dbStatus === 'failed') {
      updateData.failed_at = new Date().toISOString();
      if (errorCode) {
        updateData.error_code = errorCode;
      }
      if (errorMessage) {
        updateData.error_message = errorMessage;
      }
    }

    const { error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('external_message_id', messageSid);

    if (error) {
      return new NextResponse(null, { status: 200 });
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    return new NextResponse(null, { status: 200 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
