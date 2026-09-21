// Database types generated from the Supabase schema
// Run `supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts` to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Customer {
  id: string
  client_id: string
  external_id: string | null
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  tags: string[] | null
  metadata: Json | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Lead {
  id: string
  client_id: string
  external_id: string | null
  customer_id: string | null
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  source: string | null
  status: 'new' | 'contacted' | 'qualified' | 'estimate_sent' | 'converted' | 'lost' | 'archived'
  estimated_value: number | null
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface Estimate {
  id: string
  client_id: string
  external_id: string | null
  customer_id: string
  lead_id: string | null
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'expired' | 'converted_to_job' | 'archived'
  total_amount: number
  line_items: Json
  sent_at: string | null
  viewed_at: string | null
  expires_at: string | null
  converted_at: string | null
  metadata: Json | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Consent {
  id: string
  client_id: string
  customer_id: string
  type: 'sms' | 'email' | 'phone_call'
  status: 'granted' | 'revoked' | 'pending' | 'unknown'
  source: string | null
  proof_reference: string | null
  granted_at: string | null
  revoked_at: string | null
  expires_at: string | null
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  client_id: string
  customer_id: string
  estimate_id: string | null
  lead_id: string | null
  channel: 'sms' | 'email' | 'phone' | 'chat'
  status: 'open' | 'closed' | 'archived' | 'handoff_required'
  metadata: Json | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface Message {
  id: string
  client_id: string
  conversation_id: string
  customer_id: string
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email' | 'phone' | 'chat'
  content: string
  external_message_id: string | null
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'received' | 'processing' | 'processed'
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  error_code: string | null
  error_message: string | null
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  client_id: string
  external_id: string | null
  customer_id: string
  estimate_id: string | null
  lead_id: string | null
  conversation_id: string | null
  booking_number: string
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  revenue_amount: number | null
  metadata: Json | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface WorkflowEvent {
  id: string
  client_id: string
  event_type: string
  event_source: string
  idempotency_key: string
  payload: Json
  processed: boolean
  processing_started_at: string | null
  processed_at: string | null
  processing_error: string | null
  retry_count: number
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface Action {
  id: string
  client_id: string
  customer_id: string | null
  lead_id: string | null
  estimate_id: string | null
  conversation_id: string | null
  booking_id: string | null
  workflow_event_id: string | null
  worker_type: 'intelligence' | 'recovery' | 'safety' | 'operations'
  action_type: string
  risk_level: 'green' | 'yellow' | 'red'
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed' | 'cancelled' | 'expired'
  input: Json
  output: Json | null
  approval_required: boolean
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface Error {
  id: string
  client_id: string
  workflow_event_id: string | null
  action_id: string | null
  worker_type: 'intelligence' | 'recovery' | 'safety' | 'operations' | 'orchestrator' | 'unknown'
  error_code: string
  error_message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  context: Json | null
  stack_trace: string | null
  resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  client_id: string
  actor_type: 'user' | 'worker' | 'system' | 'webhook' | 'api'
  actor_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  old_values: Json | null
  new_values: Json | null
  metadata: Json | null
  created_at: string
}

export interface ClientSop {
  id: string
  client_id: string
  name: string
  version: string
  status: 'draft' | 'active' | 'archived' | 'deprecated'
  content: Json
  effective_at: string
  expires_at: string | null
  created_by: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface ApiUsage {
  id: string
  client_id: string
  provider: string
  endpoint: string
  method: string
  status_code: number | null
  request_count: number
  response_time_ms: number | null
  cost_usd: number
  metadata: Json | null
  recorded_at: string
}

export interface CostLedger {
  id: string
  client_id: string
  category: 'llm' | 'messaging' | 'crm_api' | 'storage' | 'compute' | 'other'
  provider: string
  description: string
  amount_usd: number
  quantity: number
  unit_cost_usd: number | null
  reference_type: string | null
  reference_id: string | null
  metadata: Json | null
  incurred_at: string
  created_at: string
}

export interface Client {
  id: string
  name: string
  display_name: string | null
  timezone: string
  currency: string
  status: 'active' | 'suspended' | 'archived'
  settings: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
  kill_switch_enabled: boolean
}

export interface ClientMember {
  id: string
  client_id: string
  user_id: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'active' | 'invited' | 'suspended' | 'revoked'
  invited_by: string | null
  invited_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface OptOutKeyword {
  id: string
  client_id: string
  keyword: string
  channel: 'sms' | 'email' | 'phone_call' | 'all'
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkerAuthorization {
  id: string
  client_id: string
  worker_id: string
  worker_type: 'intelligence' | 'recovery' | 'safety' | 'operations'
  scope: string[]
  status: 'active' | 'revoked' | 'expired'
  granted_by: string | null
  granted_at: string
  expires_at: string | null
  revoked_at: string | null
  revoked_by: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export interface SystemAuditLog {
  id: string
  actor_type: 'system' | 'migration' | 'security' | 'admin'
  actor_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  client_id: string | null
  old_values: Json | null
  new_values: Json | null
  metadata: Json | null
  created_at: string
}

export interface MigrationHistory {
  id: number
  migration_name: string
  applied_at: string
  rolled_back_at: string | null
  success: boolean
  error_message: string | null
}

export interface WebhookProvider {
  id: string
  client_id: string
  provider_name: string
  display_name: string
  status: 'active' | 'paused' | 'revoked'
  auth_type: 'hmac_sha256' | 'hmac_sha1' | 'bearer_token' | 'basic_auth' | 'custom_header'
  secret_ref: string
  header_name: string | null
  event_type_mapping: Json
  tenant_resolution: Json
  max_payload_size_bytes: number
  allowed_ips: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WebhookCredential {
  id: string
  provider_id: string
  client_id: string
  encrypted_secret: string
  secret_version: number
  algorithm: string
  created_by: string | null
  created_at: string
  expires_at: string | null
}

export interface IngestionEvent {
  id: string
  client_id: string
  provider_id: string
  external_event_id: string
  provider_event_type: string
  internal_event_type: string | null
  raw_payload: Json
  raw_headers: Json
  idempotency_key: string
  provider_event_timestamp: string | null
  received_at: string
  status: 'received' | 'processing' | 'mapped' | 'workflow_created' | 'completed' | 'failed' | 'retryable_failed'
  processing_started_at: string | null
  processing_completed_at: string | null
  retry_count: number
  last_error: string | null
  last_error_at: string | null
  correlation_id: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export interface IngestionProcessingLog {
  id: string
  ingestion_event_id: string
  client_id: string
  stage: 'signature_verify' | 'schema_validate' | 'duplicate_check' | 'persist' | 'tenant_resolve' | 'event_map' | 'workflow_create' | 'complete'
  status: 'started' | 'success' | 'failed' | 'retry'
  error_message: string | null
  duration_ms: number | null
  metadata: Json
  created_at: string
}

export interface CircuitBreakerState {
  id: string
  client_id: string
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  failure_count: number
  last_failure_time: string | null
  created_at: string
  updated_at: string
}

export interface SystemConfig {
  key: string
  value: string
  description: string | null
  updated_at: string
  updated_by: string | null
}