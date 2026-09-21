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

export async function checkOptOutStatus(
  supabase: SupabaseClient,
  clientId: string,
  customerId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('consents')
      .select('status')
      .eq('client_id', clientId)
      .eq('customer_id', customerId)
      .eq('status', 'revoked')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[ConsentCheck] Error checking opt-out status, defaulting to opted-out:', error.message);
      return true;
    }

    return !!data;
  } catch {
    console.error('[ConsentCheck] Unexpected error checking opt-out status, defaulting to opted-out');
    return true;
  }
}

export async function recordOptOut(
  supabase: SupabaseClient,
  clientId: string,
  customerId: string,
  channel: 'sms' | 'email' | 'phone_call'
): Promise<void> {
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from('consents')
    .upsert(
      {
        client_id: clientId,
        customer_id: customerId,
        type: channel,
        status: 'revoked',
        revoked_at: now,
        updated_at: now,
      },
      { onConflict: 'client_id,customer_id,type' }
    );

  if (upsertError) {
    throw new Error(`Failed to record opt-out: ${upsertError.message}`);
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    client_id: clientId,
    actor_type: 'system',
    actor_id: 'consent-worker',
    action: 'consent_revoked',
    resource_type: 'consent',
    resource_id: `${clientId}:${customerId}:${channel}`,
    metadata: { customer_id: customerId, channel, reason: 'opt_out_keyword' },
  });

  if (auditError) {
    console.error('[ConsentCheck] Failed to record audit log for opt-out:', auditError.message);
  }
}
