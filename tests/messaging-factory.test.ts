import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMessagingAdapter } from '@/lib/messaging';
import { MockMessagingAdapter } from '@/lib/workers/execution/adapters';
import { TwilioMessagingAdapter } from '@/lib/messaging/twilio';

describe('createMessagingAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns MockMessagingAdapter by default', () => {
    delete process.env.MESSAGING_PROVIDER;
    const adapter = createMessagingAdapter();
    expect(adapter).toBeInstanceOf(MockMessagingAdapter);
  });

  it('returns MockMessagingAdapter when provider is mock', () => {
    process.env.MESSAGING_PROVIDER = 'mock';
    const adapter = createMessagingAdapter();
    expect(adapter).toBeInstanceOf(MockMessagingAdapter);
  });

  it('returns TwilioMessagingAdapter when provider is twilio', () => {
    process.env.MESSAGING_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_FROM_NUMBER = '+15551234567';

    const adapter = createMessagingAdapter();
    expect(adapter).toBeInstanceOf(TwilioMessagingAdapter);
  });

  it('falls back to mock when twilio config is missing', () => {
    process.env.MESSAGING_PROVIDER = 'twilio';
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;

    const adapter = createMessagingAdapter();
    expect(adapter).toBeInstanceOf(MockMessagingAdapter);
  });

  it('uses explicit config over env vars', () => {
    process.env.MESSAGING_PROVIDER = 'twilio';

    const adapter = createMessagingAdapter({
      provider: 'mock',
    });
    expect(adapter).toBeInstanceOf(MockMessagingAdapter);
  });

  it('accepts explicit twilio config', () => {
    const adapter = createMessagingAdapter({
      provider: 'twilio',
      twilio: {
        accountSid: 'AC123',
        authToken: 'token',
        fromNumber: '+15551234567',
      },
    });
    expect(adapter).toBeInstanceOf(TwilioMessagingAdapter);
  });
});
