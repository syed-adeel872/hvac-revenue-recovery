import { DispatchParams, DeliveryResult } from './types';

export interface MessagingAdapter {
  send(params: DispatchParams): Promise<DeliveryResult>;
}

export class MockMessagingAdapter implements MessagingAdapter {
  private failureRate: number;
  private callCount = 0;

  constructor(options: { failureRate?: number } = {}) {
    this.failureRate = options.failureRate ?? 0;
  }

  async send(params: DispatchParams): Promise<DeliveryResult> {
    this.callCount++;

    await new Promise((resolve) => setTimeout(resolve, 10));

    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      return {
        success: false,
        error: 'Mock delivery failure',
        errorCode: 'MOCK_DELIVERY_FAILED',
      };
    }

    return {
      success: true,
      externalId: `mock-${params.channel}-${this.callCount}-${Date.now()}`,
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }
}
