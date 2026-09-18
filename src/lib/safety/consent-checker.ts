import { SupabaseClient } from '@supabase/supabase-js';
import { ConsentStatus, OptOutKeyword } from './types';

export async function checkConsentStatus(
  supabase: SupabaseClient,
  clientId: string,
  customerId: string,
  channel: 'sms' | 'email' | 'phone_call'
): Promise<ConsentStatus | null> {
  try {
    const { data, error } = await supabase
      .from('consents')
      .select('status, expires_at, granted_at, revoked_at')
      .eq('client_id', clientId)
      .eq('customer_id', customerId)
      .eq('type', channel)
      .single();

    if (error || !data) return null;

    return {
      status: data.status,
      expiresAt: data.expires_at,
      grantedAt: data.granted_at,
      revokedAt: data.revoked_at,
    };
  } catch {
    return null;
  }
}

export async function checkOptOutKeywords(
  supabase: SupabaseClient,
  clientId: string,
  keyword: string,
  channel: 'sms' | 'email' | 'phone_call'
): Promise<OptOutKeyword | null> {
  const { data, error } = await supabase
    .from('opt_out_keywords')
    .select('id, keyword, channel')
    .eq('client_id', clientId)
    .eq('keyword', keyword)
    .eq('is_active', true)
    .or(`channel.eq.${channel},channel.eq.all`)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    keyword: data.keyword,
    channel: data.channel,
  };
}
