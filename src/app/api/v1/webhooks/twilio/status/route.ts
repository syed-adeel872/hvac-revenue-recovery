import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

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
  try {
    const formData = await request.formData();

    const messageSid = formData.get('MessageSid') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const errorCode = formData.get('ErrorCode') as string;
    const errorMessage = formData.get('ErrorMessage') as string;

    if (!messageSid || !messageStatus) {
      return new NextResponse(null, { status: 200 });
    }

    const supabase = await createAdminClient();

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
