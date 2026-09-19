import { DispatchParams, DeliveryResult } from '@/lib/workers/execution/types';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  statusCallbackUrl?: string;
}

export interface TwilioMessage {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  dateCreated: string;
  dateUpdated: string;
  errorCode: number | null;
  errorMessage: string | null;
}

export class TwilioMessagingAdapter {
  private config: TwilioConfig;
  private fetchFn: typeof fetch;

  constructor(
    config: TwilioConfig,
    fetchImpl?: typeof fetch
  ) {
    this.config = config;
    this.fetchFn = fetchImpl || globalThis.fetch.bind(globalThis);
  }

  async send(params: DispatchParams): Promise<DeliveryResult> {
    if (params.channel !== 'sms') {
      return {
        success: false,
        error: `Twilio adapter only supports SMS, got channel: ${params.channel}`,
        errorCode: 'UNSUPPORTED_CHANNEL',
      };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;

    const body = new URLSearchParams();
    body.append('To', params.to);
    body.append('From', this.config.fromNumber);
    body.append('Body', params.content);

    if (this.config.statusCallbackUrl) {
      body.append('StatusCallback', this.config.statusCallbackUrl);
    }

    const credentials = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`
    ).toString('base64');

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Twilio API error: ${response.status}`;
        let errorCode = 'TWILIO_API_ERROR';

        try {
          const parsed = JSON.parse(errorBody);
          errorMessage = parsed.message || errorMessage;
          errorCode = parsed.code ? String(parsed.code) : errorCode;
        } catch {
          // Use default error message
        }

        return {
          success: false,
          error: errorMessage,
          errorCode,
        };
      }

      const message: TwilioMessage = await response.json();

      return {
        success: true,
        externalId: message.sid,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Twilio error';
      return {
        success: false,
        error: errorMessage,
        errorCode: 'TWILIO_NETWORK_ERROR',
      };
    }
  }

  static validateTwilioSignature(
    requestUrl: string,
    params: Record<string, string>,
    signature: string,
    authToken: string
  ): boolean {
    const crypto = require('crypto');

    let data = requestUrl;
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(data);
    const computedSignature = hmac.digest('base64');

    return computedSignature === signature;
  }
}
