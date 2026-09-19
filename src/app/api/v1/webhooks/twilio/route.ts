import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { TwilioMessagingAdapter } from '@/lib/messaging/twilio';

const WEBHOOK_BASE_URL = process.env.APP_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;
    const numMedia = parseInt(formData.get('NumMedia') as string || '0', 10);

    if (!from || !body || !messageSid) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        }
      );
    }

    const supabase = await createAdminClient();

    const { data: existingMessage } = await supabase
      .from('messages')
      .select('id')
      .eq('external_message_id', messageSid)
      .single();

    if (existingMessage) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        }
      );
    }

    const { data: customers } = await supabase
      .from('customers')
      .select('id, client_id')
      .eq('phone', from)
      .limit(1);

    if (!customers || customers.length === 0) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        }
      );
    }

    const customer = customers[0];
    const clientId = customer.client_id;

    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('client_id', clientId)
      .eq('channel', 'sms')
      .eq('status', 'open')
      .limit(1);

    let conversationId: string;

    if (conversations && conversations.length > 0) {
      conversationId = conversations[0].id;
    } else {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          client_id: clientId,
          customer_id: customer.id,
          channel: 'sms',
          status: 'open',
        })
        .select('id')
        .single();

      if (convError || !newConversation) {
        return new NextResponse(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/xml' },
          }
        );
      }

      conversationId = newConversation.id;
    }

    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = formData.get(`MediaUrl${i}`) as string;
      if (mediaUrl) {
        mediaUrls.push(mediaUrl);
      }
    }

    const metadata: Record<string, unknown> = {
      twilio_message_sid: messageSid,
      from_number: from,
      to_number: to,
    };
    if (mediaUrls.length > 0) {
      metadata.media_urls = mediaUrls;
    }

    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        client_id: clientId,
        conversation_id: conversationId,
        customer_id: customer.id,
        direction: 'inbound',
        channel: 'sms',
        content: body,
        external_message_id: messageSid,
        status: 'received',
        metadata: JSON.stringify(metadata),
      });

    if (msgError) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        }
      );
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (error) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  }
}
