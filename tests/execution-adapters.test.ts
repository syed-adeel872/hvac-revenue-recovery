import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMessagingAdapter } from '@/lib/workers/execution/adapters';

describe('MockMessagingAdapter', () => {
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    adapter = new MockMessagingAdapter();
  });

  it('returns success by default', async () => {
    const result = await adapter.send({
      channel: 'sms',
      to: '+1234567890',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(result.success).toBe(true);
    expect(result.externalId).toBeDefined();
    expect(result.externalId).toContain('mock-sms');
  });

  it('generates unique external IDs', async () => {
    const result1 = await adapter.send({
      channel: 'sms',
      to: '+1234567890',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    const result2 = await adapter.send({
      channel: 'sms',
      to: '+1234567890',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(result1.externalId).not.toBe(result2.externalId);
  });

  it('fails when failure rate triggers', async () => {
    const failingAdapter = new MockMessagingAdapter({ failureRate: 1 });
    const result = await failingAdapter.send({
      channel: 'sms',
      to: '+1234567890',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Mock delivery failure');
    expect(result.errorCode).toBe('MOCK_DELIVERY_FAILED');
  });

  it('tracks call count', async () => {
    expect(adapter.getCallCount()).toBe(0);
    await adapter.send({
      channel: 'sms',
      to: '+1234567890',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(adapter.getCallCount()).toBe(1);
    await adapter.send({
      channel: 'email',
      to: 'test@example.com',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(adapter.getCallCount()).toBe(2);
  });

  it('resets call count', async () => {
    await adapter.send({
      channel: 'sms',
      to: '+1234567890',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(adapter.getCallCount()).toBe(1);
    adapter.reset();
    expect(adapter.getCallCount()).toBe(0);
  });

  it('includes channel in external ID', async () => {
    const result = await adapter.send({
      channel: 'email',
      to: 'test@example.com',
      content: 'Hello',
      clientId: 'client-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
    });
    expect(result.externalId).toContain('mock-email');
  });
});
