import { MessagingAdapter, MockMessagingAdapter } from '@/lib/workers/execution/adapters';
import { TwilioMessagingAdapter, TwilioConfig } from './twilio';

export type MessagingProvider = 'mock' | 'twilio';

export interface MessagingAdapterConfig {
  provider?: MessagingProvider;
  twilio?: TwilioConfig;
}

export function createMessagingAdapter(config: MessagingAdapterConfig = {}): MessagingAdapter {
  const provider = config.provider || (process.env.MESSAGING_PROVIDER as MessagingProvider) || 'mock';

  switch (provider) {
    case 'twilio': {
      if (!config.twilio && !process.env.TWILIO_ACCOUNT_SID) {
        console.warn('Twilio config not provided, falling back to mock adapter');
        return new MockMessagingAdapter();
      }

      const twilioConfig: TwilioConfig = config.twilio || {
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        fromNumber: process.env.TWILIO_FROM_NUMBER!,
        statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL,
      };

      return new TwilioMessagingAdapter(twilioConfig);
    }

    case 'mock':
    default:
      return new MockMessagingAdapter();
  }
}

export { TwilioMessagingAdapter } from './twilio';
export type { TwilioConfig } from './twilio';
