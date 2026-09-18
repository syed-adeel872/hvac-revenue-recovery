import { SupabaseClient } from '@supabase/supabase-js';
import { RateLimitResult, RateLimitOptions } from './types';

const DEFAULT_HOURLY_LIMIT = 5;
const DEFAULT_DAILY_LIMIT = 20;

export async function checkRateLimit(
  supabase: SupabaseClient,
  clientId: string,
  customerId: string,
  channel: 'sms' | 'email' | 'phone' | 'chat',
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const hourlyLimit = options.hourly ?? DEFAULT_HOURLY_LIMIT;
  const dailyLimit = options.daily ?? DEFAULT_DAILY_LIMIT;

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { count: hourlyCount, error: hourlyError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('customer_id', customerId)
      .eq('channel', channel)
      .eq('direction', 'outbound')
      .gte('created_at', oneHourAgo);

    if (hourlyError) {
      return {
        allowed: false,
        reason: 'Failed to check hourly rate limit',
        current: 0,
        limit: hourlyLimit,
        window: 'hourly',
      };
    }

    const hourly = hourlyCount ?? 0;
    if (hourly >= hourlyLimit) {
      return {
        allowed: false,
        reason: `Hourly rate limit exceeded: ${hourly}/${hourlyLimit}`,
        current: hourly,
        limit: hourlyLimit,
        window: 'hourly',
      };
    }

    const { count: dailyCount, error: dailyError } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('customer_id', customerId)
      .eq('channel', channel)
      .eq('direction', 'outbound')
      .gte('created_at', oneDayAgo);

    if (dailyError) {
      return {
        allowed: false,
        reason: 'Failed to check daily rate limit',
        current: 0,
        limit: dailyLimit,
        window: 'daily',
      };
    }

    const daily = dailyCount ?? 0;
    if (daily >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily rate limit exceeded: ${daily}/${dailyLimit}`,
        current: daily,
        limit: dailyLimit,
        window: 'daily',
      };
    }

    return {
      allowed: true,
      current: hourly,
      limit: hourlyLimit,
      window: 'hourly',
    };
  } catch {
    return {
      allowed: false,
      reason: 'Rate limit check failed - defaulting to blocked',
      current: 0,
      limit: hourlyLimit,
      window: 'hourly',
    };
  }
}
