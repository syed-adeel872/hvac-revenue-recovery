# System Architecture & Security Posture Report

**Project:** HVAC Revenue Recovery — AI-Powered Revenue Recovery System for US HVAC Contractors
**Version:** 0.1.0
**Report Date:** September 21, 2026
**Project Owner:** Adeel
**Test Suite:** 640 tests across 52 test files — all passing
**Migrations:** 22 sequential SQL migrations (000001–000022)

---

## Table of Contents

1. [System Architecture & Data Flow](#1-system-architecture--data-flow)
2. [Security & Zero-Trust Posture](#2-security--zero-trust-posture)
3. [Database & Migrations State](#3-database--migrations-state)
4. [Resilience & Testing Coverage](#4-resilience--testing-coverage)
5. [Frontend/UX Integrity](#5-frontendux-integrity)

---

## 1. System Architecture & Data Flow

### 1.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Next.js (App Router) | 15.0.0 |
| UI Library | React | 18.3.x |
| Language | TypeScript (strict mode) | 5.6.x |
| Database | Supabase (PostgreSQL) | — |
| ORM/Client | @supabase/ssr + @supabase/supabase-js | 0.5.x / 2.45.x |
| LLM Provider | OpenAI SDK (compatible) | 7.15.x |
| Validation | Zod | 3.23.x |
| CSS | Tailwind CSS | 3.4.x |
| UI Components | Radix UI + Lucide Icons | — |
| Testing | Vitest | 5.0.x |
| Build | Next.js SWC (WASM) | — |

### 1.2 High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js App Router)               │
│  Dashboard │ Operations │ Safety │ Tenants │ Pipeline │ Login   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ adminFetch (Bearer JWT)
┌───────────────────────────▼─────────────────────────────────────┐
│                     MIDDLEWARE (Edge Runtime)                    │
│  Session management │ Route guards │ Method guards │ x-request-id│
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                   API ROUTES (14 endpoints)                     │
│                                                                 │
│  Admin (11)         Webhooks (4)          Jobs (2)              │
│  ├─ stats           ├─ twilio             ├─ run-pipeline       │
│  ├─ kill-switch     ├─ twilio/status      └─ process-webhooks   │
│  ├─ tenants         ├─ servicetitan                             │
│  ├─ audit           └─ [provider_name]    Utility               │
│  ├─ customers                             └─ generate-message   │
│  ├─ safety                                                       │
│  ├─ workflows                                                    │
│  ├─ actions                                                      │
│  ├─ actions/[actionId]                                           │
│  ├─ credentials                                                  │
│  └─ integrations                                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ createAdminClient() (service_role)
┌───────────────────────────▼─────────────────────────────────────┐
│                  SAFETY LAYER (before any outbound)             │
│  Kill Switch → Consent Check → Opt-Out Check → Policy Engine    │
│  → Safety Decision: ALLOW / BLOCK / ESCALATE                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                 WORKER ENGINES (4 logical workers)               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Intelligence  │→│   Recovery   │→│   Execution   │          │
│  │   Worker      │  │   Worker    │  │   Worker     │          │
│  │              │  │              │  │              │          │
│  │ • LLM call   │  │ • Intent    │  │ • Kill switch│          │
│  │ • Scoring    │  │   classify   │  │ • Rate limit │          │
│  │ • Strategy   │  │ • Draft     │  │ • Circuit    │          │
│  │ • Risk level │  │   response  │  │   breaker    │          │
│  │              │  │ • Safety    │  │ • Dispatch   │          │
│  │              │  │   evaluate  │  │   message    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐                                              │
│  │  Operations  │  (metrics, anomaly detection, reporting)     │
│  │   Worker     │                                              │
│  └──────────────┘                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                   EXTERNAL INTEGRATIONS                         │
│  Twilio (SMS) │ ServiceTitan (CRM/FSM) │ OpenAI (LLM)         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Webhook Ingestion Pipeline

External CRM/FSM events enter through the webhook layer:

```
External Webhook Request
  │
  ├─ Signature Verification (HMAC-SHA256 / HMAC-SHA1)
  │   └─ ServiceTitan: adapter.verify() with encrypted credential
  │   └─ Twilio: TwilioMessagingAdapter.validateTwilioSignature()
  │
  ├─ HTTP Rate Limiting (in-memory sliding window)
  │   └─ Twilio: 100 req/min per IP
  │   └─ ServiceTitan/Generic: 60 req/min per IP
  │
  ├─ Payload Size Validation (1MB max)
  │
  ├─ Schema Validation (Zod)
  │   └─ ServiceTitan: validateServiceTitanPayload()
  │   └─ Generic: validateWebhookPayload()
  │
  ├─ Tenant Resolution
  │   └─ resolveTenantFromProvider() → resolveTenantConsistency()
  │
  ├─ Idempotency Check
  │   └─ computeIdempotencyKey() → checkAndReserveIdempotency()
  │
  ├─ Replay Protection
  │   └─ validateTimestamp() (5-min max age, 60-sec max future)
  │
  ├─ Event Persistence
  │   └─ persistIngestionEvent() → ingestion_events table
  │
  └─ Processing Stage Logging
      └─ logProcessingStage() → ingestion_processing_log table
```

### 1.4 Worker Engine Details

#### Intelligence Worker (`src/lib/workers/intelligence/`)

**Purpose:** Analyzes incoming workflow events (e.g., estimate_unbooked), scores opportunity quality, and recommends recovery strategy.

**Flow:**
1. `claimEvents()` — claims unprocessed workflow_events for a tenant (SELECT ... FOR UPDATE SKIP LOCKED)
2. `sanitizePayload()` — strips HTML, removes script tags, sanitizes all string fields
3. `extractCustomerContext()` — extracts customer name, email, phone from sanitized payload
4. `callLLM()` — sends structured prompt to OpenAI-compatible API with system prompt + analysis prompt
5. `IntelligenceOutputSchema` — Zod validation of LLM response (opportunityType, qualificationScore, estimatedRevenue, recommendedStrategy, confidence, reasoning)
6. `adjustStrategy()` — overrides LLM if confidence < threshold or revenue ≥ $10K → flag_for_human_review
7. `recordAction()` — inserts into `actions` table with idempotency key `intelligence:{event_id}`
8. `markEventProcessed()` — marks workflow_event as processed

**Output:** `IntelligenceOutput` with opportunityType, qualificationScore (0-100), estimatedRevenue, recommendedStrategy, riskFactors, confidence, reasoning.

#### Recovery Worker (`src/lib/workers/recovery/`)

**Purpose:** Takes Intelligence Worker output and drafts a customer-facing response.

**Flow:**
1. `claimIntelligenceActions()` — claims approved intelligence actions
2. `classifyIntent()` — deterministic keyword-based intent classification (interested, pricing_question, opt_out, general_question, etc.)
3. `getConversationHistory()` — loads recent messages for context
4. `draftResponse()` — calls LLM with intent + intelligence output + conversation context → drafts professional response
5. `validateDraftConstraints()` — enforces 320-char max, non-empty, no prohibited phrases
6. `evaluateSafety()` — full safety check (consent, opt-out, policies)
7. `createRecoveryAction()` — inserts into `actions` table with idempotency key `recovery:{original_action_id}`
8. Trace ID propagation via `metadata.trace_id`

**Special handling:**
- If intent is `opt_out` → calls `recordOptOut()` to revoke consent + audit log
- If safety returns BLOCK → action rejected
- If safety returns ESCALATE or confidence < threshold → approval required

#### Execution Worker (`src/lib/workers/execution/`)

**Purpose:** Takes approved Recovery Worker output and dispatches the actual message.

**Flow:**
1. `claimRecoveryActions()` — claims approved recovery actions
2. **Kill Switch Check** — `checkKillSwitch(supabase, clientId)` — fail-closed
3. **Safety Evaluation** — `evaluateSafety()` — consent, opt-out, policies
4. **Rate Limit Check** — `checkRateLimit()` — 5/hour, 20/day per customer per channel
5. **Circuit Breaker Check** — `PersistentCircuitBreaker.canExecute()` — 5 failures to trip
6. `dispatchMessage()` — sends via adapter (Twilio or Mock)
7. **Post-dispatch:** `recordSuccess()` or `recordFailure()` on circuit breaker
8. `markActionCompleted()` / `markActionFailed()` via `transition_action_status` RPC

#### Operations Worker (`src/lib/workers/operations/`)

**Purpose:** Metrics collection, anomaly detection, reporting.

- `metrics.ts` — calculates recovery rates, pipeline throughput, cost per recovery
- `anomaly-detector.ts` — detects unusual patterns in workflow events
- Dashboard integration via `/api/v1/admin/stats` and `/api/v1/admin/workflows`

### 1.5 Pipeline Orchestrator (`src/lib/pipeline/orchestrator.ts`)

The orchestrator chains all workers in sequence per tenant:

```
For each tenant:
  1. Ingestion (process-webhooks)
  2. Intelligence (process unprocessed events)
  3. Recovery (draft responses for approved intelligence)
  4. Execution (send approved recovery messages)
  5. Operations (metrics collection)
```

Kill switch checked between each stage. Multi-tenant mode processes multiple clients in parallel.

---

## 2. Security & Zero-Trust Posture

### 2.1 Authentication & Authorization

#### Middleware Layer (`src/middleware.ts`)

| Check | Implementation |
|-------|---------------|
| Session validation | `supabase.auth.getUser()` via SSR client |
| Unauthenticated users | Redirect to `/login` (except public routes) |
| Authenticated users on `/login` | Redirect to `/` |
| Public routes bypass | `/api/v1/webhooks/*`, `/api/v1/jobs/*`, `/api/generate-message` |
| Method guard | Non-POST on webhook routes → 405 Method Not Allowed |
| Request tracing | `x-request-id: crypto.randomUUID()` on `/api/v1/admin/*` |

#### API Route Authentication

| Auth Function | Used By | Mechanism |
|---------------|---------|-----------|
| `verifyAuth()` | Actions approve/reject (`[actionId]`) | Supabase session cookie only — human users only |
| `verifyAuthOrCron()` | All other admin routes, jobs, webhooks | Supabase session OR `CRON_SECRET` Bearer token (timing-safe comparison) |

#### Tenant Isolation (`src/lib/admin-tenant.ts`)

Every admin API route calls `resolveClientId(supabase, userId)`:

1. Queries `client_members` for user with `status = 'active'` and `role IN ('owner', 'admin')`
2. Verifies referenced `clients` row exists with `status = 'active'`
3. Cron system user (`cron-system`) resolves to first active client
4. If no tenant association found → throws `Unauthorized: No tenant association`
5. All subsequent queries are scoped by `.eq('client_id', clientId)`

**Pattern:** Service-role client (`createAdminClient()`) bypasses RLS, so tenant isolation is enforced at the application layer via `resolveClientId` + `.eq('client_id', clientId)` on every query.

#### Role-Based Authorization

| Route | Role Required | Implementation |
|-------|---------------|----------------|
| Kill switch POST (toggle) | `owner` only | Checks `client_members.role === 'owner'` |
| Kill switch GET | Any authenticated user | Read-only |
| Action approve/reject | Any authenticated user | `verifyAuth()` (no cron) |
| All other admin routes | Any authenticated user | `verifyAuthOrCron()` |

### 2.2 Absolute WORM Compliance (Audit Tables)

**Migration:** `000022_audit_worm_trigger.sql`

#### Tables Protected

| Table | Purpose |
|-------|---------|
| `audit_logs` | Application-level audit trail (per-tenant) |
| `system_audit_logs` | System-level audit trail (cross-tenant) |

#### WORM Enforcement Mechanism

```sql
-- BEFORE UPDATE OR DELETE trigger — fires for ALL roles
CREATE TRIGGER audit_logs_worm_trigger
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();

-- Function raises exception unconditionally
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % operations are not permitted', TG_OP
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$;
```

**Coverage:**
- `BEFORE` trigger fires before any row-level operation — cannot be bypassed
- `SECURITY DEFINER` — executes with function owner privileges, immune to role escalation
- Applied to both `audit_logs` and `system_audit_logs`
- `REVOKE UPDATE, DELETE ON audit_logs FROM authenticated, service_role`
- `REVOKE UPDATE, DELETE ON system_audit_logs FROM authenticated, service_role`

**Note:** Superusers can still `DISABLE TRIGGER` — this is a Postgres architectural limitation. The trigger is the strongest protection achievable within Supabase's managed Postgres.

#### RLS Policies on Audit Tables

| Table | SELECT Policy | INSERT Policy | UPDATE/DELETE |
|-------|--------------|---------------|---------------|
| `audit_logs` | `audit_logs_select_tenant` — `client_id = get_current_tenant_id()` | `audit_logs_insert_tenant` — `client_id = get_current_tenant_id()` | None + WORM trigger |
| `system_audit_logs` | `system_audit_logs_select_tenant_admin` — owner/admin, client_id IS NULL or matches | `system_audit_logs_insert_system` — `client_id IS NULL OR client_id = get_current_tenant_id()` | None + WORM trigger |

### 2.3 Edge Security & API Rate Limiting

#### HTTP Rate Limiter (`src/lib/safety/resilience/http-rate-limiter.ts`)

In-memory sliding-window rate limiter. Zero external dependencies.

| Endpoint Category | Key Pattern | Window | Max Requests | Rationale |
|-------------------|-------------|--------|--------------|-----------|
| Twilio inbound | `twilio:{ip}` | 60s | 100 | Covers normal Twilio webhook volume |
| Twilio status | `twilio-status:{ip}` | 60s | 100 | Same |
| ServiceTitan | `servicetitan:{ip}` | 60s | 60 | ServiceTitan API limits |
| Generic provider | `webhook:{ip}` | 60s | 60 | Default for unknown providers |
| Run pipeline | `run-pipeline` | 60s | 10 | Internal cron, low frequency |
| Process webhooks | `process-webhooks` | 60s | 10 | Internal cron, low frequency |

**Response headers:** `Retry-After` (seconds) when rate limited.

#### Outbound Messaging Rate Limiter (`src/lib/safety/resilience/rate-limiter.ts`)

Database-backed rate limiter for outbound messages:

| Config | Default | Scope |
|--------|---------|-------|
| Hourly limit | 5 messages | Per customer, per client, per channel |
| Daily limit | 20 messages | Per customer, per client, per channel |

Queries the `messages` table. Fail-closed (defaults to blocked on error).

#### Twilio Signature Verification

**Status:** Mandatory in production.

Both Twilio webhook routes (`/webhooks/twilio` and `/webhooks/twilio/status`) return `500 Server misconfiguration` if `TWILIO_AUTH_TOKEN` is not set. Signature verification is no longer optional.

### 2.4 Kill Switch with 2-Step Verification

**Global kill switch** stored in `system_config` table (`key = 'global_kill_switch'`).

**Toggle flow:**
1. User sends POST with `{ global: true/false, confirmation?: "DISABLE" }`
2. Route verifies user has `role = 'owner'` in `client_members`
3. Deactivation requires explicit `confirmation: "DISABLE"` string match
4. Upserts value into `system_config`
5. Audit log entry created in `audit_logs`

**Enforcement:**
- `checkKillSwitch(supabase, clientId)` checked in:
  - Pipeline orchestrator (between every stage)
  - Execution engine (before every outbound message)
  - Both check global AND per-tenant kill switch
- **Fail-closed:** If kill switch check fails, defaults to BLOCKED

### 2.5 Consent & Opt-Out Hardening

**Consent check flow** (before any outbound message):
1. `checkConsentStatus()` — queries `consents` table for customer + channel
2. If `status === 'revoked'` → BLOCK
3. If `status === 'unknown'` → ESCALATE
4. If `expires_at < now()` → BLOCK
5. If `status === 'pending'` → ESCALATE
6. `checkOptOutStatus()` — checks for revoked consent record
7. `checkOptOutKeywords()` — scans message content for opt-out keywords (STOP, UNSUBSCRIBE, etc.)
8. `loadClientPolicies()` — applies client-specific safety policies

**Defense-in-depth in execution engine:**
- Kill switch check → Consent check → Opt-out check → Rate limit → Circuit breaker → Dispatch
- Opt-out keywords trigger `recordOptOut()` which revokes consent + audit log

### 2.6 Webhook Security

**Signature verification:**
- ServiceTitan: HMAC-SHA256 via `ServiceTitanAdapter.verify()` with encrypted credential from DB
- Twilio: HMAC-SHA1 via `TwilioMessagingAdapter.validateTwilioSignature()` with `TWILIO_AUTH_TOKEN`
- Generic: Pluggable adapter via `createAdapter()` factory (basic-auth, bearer-token, generic-hmac)

**Credential management:**
- Webhook secrets encrypted with AES-256-GCM (`ENCRYPTION_KEY`)
- Stored in `webhook_credentials` table with versioning
- `get_webhook_credential_secret` RPC function retrieves decrypted secret
- Credentials never logged or exposed in API responses (masked with `••••••••`)

### 2.7 Security Headers

Applied to all routes via `next.config.ts`:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### 2.8 Prompt Injection Defense

**Sanitization** (`src/lib/workers/intelligence/sanitize.ts`):
- HTML tag stripping
- Script/iframe/object/embed tag removal
- JavaScript URL detection (`javascript:`, `data:`)
- Control character removal
- Field length limits

**Intent classification** (`src/lib/workers/recovery/classify-intent.ts`):
- Deterministic keyword matching — NOT LLM-dependent
- Opt-out keywords trigger immediate consent revocation
- LLM output validated against `IntelligenceOutputSchema` (Zod)

**LLM output validation:**
- Schema validation before any business action
- Confidence threshold check (below threshold → flag for human review)
- High-value estimates (≥$10K) → flag for human review

### 2.9 Secrets Management

| Secret | Storage | Access |
|--------|---------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | `createAdminClient()` — server-side only |
| `CRON_SECRET` | `.env.local` | `verifyAuthOrCron()` — timing-safe comparison |
| `ENCRYPTION_KEY` | `.env.local` | `encryptSecret()` / `decryptSecret()` |
| `LLM_API_KEY` | `.env.local` | `callLLM()` — never logged |
| `TWILIO_AUTH_TOKEN` | `.env.local` | Signature verification — never logged |
| Webhook credentials | `webhook_credentials` table | AES-256-GCM encrypted, retrieved via RPC |

**Rules enforced:**
- Never hard-code secrets
- Never commit `.env.local`
- Never expose secrets in API responses
- Never log full credentials
- Credentials masked in integration responses

---

## 3. Database & Migrations State

### 3.1 Migration Evolution (000001–000022)

| Migration | Name | Purpose |
|-----------|------|---------|
| 000001 | `initial_schema` | Core tables: clients, client_members, customers, leads, estimates, bookings, consents, conversations, messages, workflow_events, actions, errors, audit_logs, system_audit_logs |
| 000002 | `validation_tables` | opt_out_keywords, client_sops, api_usage, cost_ledger, worker_authorizations |
| 000003 | `booking_workflow` | Booking status transitions, revenue tracking |
| 000004 | `security_core` | audit_logs + system_audit_logs table definitions, initial RLS policies, `get_current_tenant_id()` function |
| 000005 | `rls_policies` | Tenant-scoped RLS policies for all tables, replacing initial policies |
| 000006 | `cross_tenant_fks` | Composite foreign keys for tenant isolation |
| 000007 | `soft_delete_cleanup` | `prevent_hard_delete_on_soft_tables()` trigger, audit_logs documented as append-only |
| 000008 | `action_idempotency` | `transition_action_status()` PL/pgSQL function — state machine with audit logging |
| 000009 | `harden_functions` | `FORCE ROW LEVEL SECURITY` on all tables, GRANTs to authenticated role |
| 000010 | `security_validation` | `validate_audit_log_append_only()`, `run_all_validations()` SECURITY DEFINER functions |
| 000011 | `rollback_hardening` | Drop/recreate references for safe rollback |
| 000012 | `security_fixes` | Security validation checks, audit_logs append-only verification |
| 000013 | `webhook_ingestion` | webhook_providers, webhook_credentials, ingestion_events, ingestion_processing_log tables; `enforce_ingestion_status_transition()` function |
| 000014 | `kill_switch` | system_config table, global kill switch infrastructure |
| 000015 | `hardening_fixes` | Fix system_audit_logs INSERT policy, explicit GRANTs/REVOKEs |
| 000016 | `production_hardening` | circuit_breaker_state table, system_config table, RLS fixes, webhook table grants |
| 000017 | `consistency_fixes` | `atomic_record_circuit_breaker_failure/success`, `atomic_check_circuit_breaker` SQL functions |
| 000018 | `message_status_expansion` | Expanded message status values |
| 000019 | `audit_logs_nullable_resource_id` | `ALTER TABLE audit_logs ALTER COLUMN resource_id DROP NOT NULL` |
| 000020 | `grant_service_role_permissions` | `GRANT ALL PRIVILEGES ON ALL TABLES TO service_role` |
| 000021 | `circuit_breaker_security` | `SECURITY DEFINER` + `SET search_path = public` on all 3 atomic circuit breaker functions |
| 000022 | `audit_worm_trigger` | `BEFORE UPDATE OR DELETE` WORM triggers on audit_logs + system_audit_logs; `REVOKE UPDATE, DELETE` from all roles |

### 3.2 Key Database Objects

#### PostgreSQL Functions (30+)

| Function | Type | Purpose |
|----------|------|---------|
| `get_current_tenant_id()` | SQL | Returns `app.current_tenant_id` setting for RLS |
| `transition_action_status()` | PL/pgSQL | Action state machine with audit logging |
| `enforce_ingestion_status_transition()` | PL/pgSQL | Ingestion event state machine |
| `atomic_record_circuit_breaker_failure()` | PL/pgSQL SECURITY DEFINER | Circuit breaker failure recording |
| `atomic_record_circuit_breaker_success()` | PL/pgSQL SECURITY DEFINER | Circuit breaker success recording |
| `atomic_check_circuit_breaker()` | PL/pgSQL SECURITY DEFINER | Circuit breaker state check |
| `prevent_audit_log_mutation()` | PL/pgSQL SECURITY DEFINER | WORM trigger for audit tables |
| `prevent_system_audit_log_mutation()` | PL/pgSQL SECURITY DEFINER | WORM trigger for system audit tables |
| `prevent_hard_delete_on_soft_tables()` | PL/pgSQL | Blocks DELETE on soft-delete tables |
| `validate_audit_log_append_only()` | PL/pgSQL SECURITY DEFINER | Validates audit table protection |
| `run_all_validations()` | PL/pgSQL SECURITY DEFINER | Aggregates all validation checks |
| `get_webhook_credential_secret()` | PL/pgSQL | Retrieves decrypted webhook credential |

#### Tables by Category

| Category | Tables |
|----------|--------|
| **Tenant** | clients, client_members |
| **Customer** | customers, leads, estimates, bookings |
| **Communication** | consents, opt_out_keywords, conversations, messages |
| **Workflow** | workflow_events, actions |
| **Security** | errors, audit_logs, system_audit_logs, client_sops, api_usage, cost_ledger, worker_authorizations |
| **Webhooks** | webhook_providers, webhook_credentials, ingestion_events, ingestion_processing_log |
| **Resilience** | circuit_breaker_state, system_config |

### 3.3 Idempotency & State Transitions

**Action State Machine** (`transition_action_status()`):

```
pending → approved → executing → completed
                         ↓
                      rejected
                         ↓
                      failed
```

- State transitions are validated by the SQL function (only valid transitions allowed)
- `started_at`, `completed_at` timestamps set automatically
- Every transition logged to `audit_logs` with old/new values
- Idempotency keys: `intelligence:{event_id}`, `recovery:{action_id}`

**Ingestion Event State Machine** (`enforce_ingestion_status_transition()`):

```
received → processing → processed
              ↓
           failed
              ↓
           retrying → processing
```

### 3.4 Row-Level Security (RLS)

**All tables** have RLS enabled with `FORCE ROW LEVEL SECURITY`.

| Policy Pattern | Scope | Example |
|----------------|-------|---------|
| `*_select_tenant` | SELECT | `client_id = get_current_tenant_id() AND deleted_at IS NULL` |
| `*_insert_tenant` | INSERT | `client_id = get_current_tenant_id()` |
| `*_service_only` | ALL | `USING (false)` — service-role only |
| `audit_logs_*` | SELECT/INSERT | Tenant-scoped, append-only |
| `system_audit_logs_*` | SELECT/INSERT | Admin-only, cross-tenant for system events |

**Service-role bypass:** `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS. Tenant isolation enforced at application layer via `resolveClientId()`.

---

## 4. Resilience & Testing Coverage

### 4.1 Circuit Breaker Implementations

#### In-Memory Circuit Breaker (`src/lib/safety/resilience/circuit-breaker.ts`)

| Property | Default |
|----------|---------|
| Failure threshold | 5 |
| Recovery timeout | 30,000ms (30s) |
| States | CLOSED → OPEN → HALF_OPEN → CLOSED |

**Behavior:**
- `canExecute()`: CLOSED=true, OPEN=false (unless timeout elapsed → HALF_OPEN), HALF_OPEN=true
- `recordFailure()`: increments count, transitions to OPEN at threshold
- `recordSuccess()`: HALF_OPEN→CLOSED (reset), CLOSED→reset count
- `reset()`: hard reset to CLOSED with 0 failures

#### Persistent Circuit Breaker (`src/lib/safety/resilience/persistent-circuit-breaker.ts`)

Database-backed version storing state in `circuit_breaker_state` table.

**Same state machine** as in-memory, but:
- All operations async (Supabase queries)
- `loadState()` queries `circuit_breaker_state` by `client_id`
- `upsertState()` uses `upsert` with `onConflict: 'client_id'`
- Fail-open on `loadState()` error (returns `true` for `canExecute()`)
- Throws on `upsertState()` error

#### SQL Atomic Functions (Migration 000017 + 000021)

| Function | SECURITY DEFINER | search_path | Purpose |
|----------|-----------------|-------------|---------|
| `atomic_record_circuit_breaker_failure` | Yes | `public` | INSERT/UPDATE with row locking (`FOR UPDATE`) |
| `atomic_record_circuit_breaker_success` | Yes | `public` | Reset to CLOSED from HALF_OPEN |
| `atomic_check_circuit_breaker` | Yes | `public` | Returns `(can_execute, current_state)` |

**Note:** These SQL functions exist but are NOT called from TypeScript code (the PersistentCircuitBreaker uses direct Supabase queries). They serve as database-level enforcement if TypeScript code is bypassed.

### 4.2 Kill Switch

**Two-level kill switch:**
1. **Global:** `system_config` table, key `global_kill_switch`, value `'true'`/`'false'`
2. **Per-tenant:** `clients.kill_switch_enabled` boolean

**Fail-closed:** Both `checkKillSwitch()` and `checkGlobalKillSwitch()` default to BLOCKED on error.

**Enforcement points:**
- Pipeline orchestrator (between every stage)
- Execution engine (before every outbound message)
- Admin API toggle requires `owner` role + explicit `confirmation: "DISABLE"` for deactivation

### 4.3 Test Suite Summary

**52 test files, 640 tests — all passing.**

#### Test Categories

| Category | Files | Tests | Coverage |
|----------|-------|-------|----------|
| **Audit & Compliance** | `audit.test.ts`, `audit-runtime.test.ts` | ~20 | WORM triggers, append-only GRANTs, audit log inserts, migration complete entry |
| **Migration Structure** | `migration-structure.test.ts` | ~6 | 22 migrations, sequential numbering, no removed objects, dependency ordering |
| **Security** | `security-definer.test.ts`, `scope-checks.test.ts`, `rls.test.ts` | ~20 | SECURITY DEFINER on functions, search_path hardening, RLS policies, tenant isolation |
| **Resilience** | `resilience-circuit-breaker.test.ts`, `resilience-persistent-circuit-breaker.test.ts`, `resilience-circuit-breaker-sql.test.ts`, `resilience-kill-switch.test.ts`, `resilience-rate-limiter.test.ts` | ~45 | In-memory CB state machine, persistent CB (15 tests), SQL functions (14 tests), kill switch fail-closed, rate limiter limits |
| **HTTP Rate Limiting** | `http-rate-limiter.test.ts`, `webhook-rate-limit.test.ts` | ~20 | Sliding window, per-key isolation, window reset, webhook-specific limits |
| **Middleware** | `middleware.test.ts` | ~6 | Public route bypass, method guard, x-request-id, session management |
| **Webhook Pipeline** | `webhook-*.test.ts` (12 files) | ~80 | Signature verification, schema validation, tenant resolution, idempotency, replay protection, persistence, adapters, encryption, errors |
| **Workers** | `intelligence-engine.test.ts`, `recovery-engine.test.ts`, `execution-engine.test.ts`, `execution-dispatch.test.ts`, `execution-claim-actions.test.ts`, `execution-adapters.test.ts` | ~60 | LLM integration, intent classification, draft validation, dispatch pipeline, circuit breaker integration (4 tests), RPC transitions |
| **Safety** | `safety-engine.test.ts`, `opt-out-wiring.test.ts`, `prompt-injection.test.ts` | ~30 | Consent checks, opt-out keyword detection, policy engine, prompt injection defense |
| **Messaging** | `messaging-factory.test.ts`, `twilio-adapter.test.ts`, `servicetitan-adapter.test.ts` | ~20 | Adapter factory, Twilio signature validation, ServiceTitan verification |
| **Operations** | `operations-engine.test.ts`, `operations-metrics.test.ts`, `operations-anomaly.test.ts` | ~15 | Metrics calculation, anomaly detection, pipeline health |
| **Integration** | `e2e-pipeline.test.ts`, `api-integration.test.ts`, `jobs-process-webhooks.test.ts` | ~15 | End-to-end pipeline, API contract, webhook processing |
| **Other** | `tenant-isolation.test.ts`, `composite-fk.test.ts`, `idempotency.test.ts`, `validation-functions.test.ts` | ~20 | Tenant isolation, FK constraints, idempotency keys, validation functions |

#### Safety-Critical Tests (Release Blockers)

| Test | What It Validates |
|------|-------------------|
| Kill switch blocks execution | Pipeline stops when kill switch activated |
| Opt-out customer blocked | Revoked consent → BLOCK decision |
| Unknown consent escalated | Unknown status → ESCALATE decision |
| Prompt injection detected | Malicious input → sanitized/blocked |
| Audit logs append-only | No UPDATE/DELETE policies exist |
| WORM triggers present | BEFORE UPDATE/DELETE triggers on audit tables |
| Circuit breaker blocks when OPEN | Execution blocked after 5 failures |
| Rate limit enforced | Messages blocked above 5/hr, 20/day |
| Tenant isolation enforced | Cross-tenant queries blocked by RLS |
| Cron secret timing-safe | CRON_SECRET compared with timingSafeEqual |

### 4.4 Build Verification

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (27/27)
✓ 52 test files, 640 tests passing
✓ No warnings in production build
```

---

## 5. Frontend/UX Integrity

### 5.1 Dashboard Pages

| Page | Route | Purpose |
|------|-------|---------|
| Command Center | `/` | KPIs, recovery funnel, opportunities table, safety summary, worker timeline |
| Operations | `/operations` | Pipeline health, circuit breaker status, error tracking, KMS config |
| Safety | `/safety` | Consent management, opt-out keywords, kill switch control, outbound summary |
| Opportunities | `/opportunities` | Revenue recovery opportunities with Send button (wired to pipeline) |
| Tenants | `/tenants` | Tenant details, member management, table isolation status |
| Recovery Pipeline | `/recovery-pipeline` | Kanban board with pipeline stages |
| Integrations | `/integrations` | Provider connections, health status |
| Login | `/login` | Authentication |

### 5.2 Business Truth Enforcement

**KPI Labels (post-Phase 1):**
- Dashboard shows **"Est. Recovery"** (not "Recovered") with "(est.)" subtext
- This correctly represents `Unbooked estimates × average estimate value` as an **opportunity/exposure estimate**, not verified recovered revenue
- Per AGENTS.md Section 23: "Never report potential revenue as actual recovered revenue"

**Pipeline Stage Mapping (post-Phase 1):**
- `executing → "sent"` (not "delivered" — delivery not yet confirmed)
- `approvalRequired` scoped to `status === "pending"` only
- Opportunities Send button wired to `POST /api/v1/jobs/run-pipeline` with double-click prevention

### 5.3 Data Loading Pattern

All pages use `useDashboard()` hook from `DashboardContext` which:
- Fetches from `/api/v1/admin/stats`, `/api/v1/admin/safety`, `/api/v1/admin/workflows`
- Uses `adminFetch()` which attaches Supabase JWT
- Shows `Skeleton` components during loading
- Shows error banner with Retry button on failure
- Auto-refreshes via polling

### 5.4 Design System

| Token | Value | Usage |
|-------|-------|-------|
| Background darkest | `#0A0E14` | Page background |
| Card background | `#141A25` | Card surfaces |
| Borders | `#1E293B` | Card borders, dividers |
| Blue accent | `#3B82F6` | Primary actions, links |
| Green accent | `#10B981` | Success states, healthy |
| Red accent | `#EF4444` | Errors, blocked, danger |
| Amber accent | `#F59E0B` | Warnings, escalated |
| UI font | Inter | All UI text |
| Mono font | JetBrains Mono | IDs, logs, code |

### 5.5 Component Architecture

| Component | Purpose |
|-----------|---------|
| `DashboardShell` | Layout wrapper (Sidebar + Topbar + content area) |
| `DashboardContext` | React context providing `useDashboard()` hook |
| `KPICard` | Metric card with value, change indicator, skeleton loading |
| `OpportunitiesTable` | Revenue recovery opportunities with consent/safety status |
| `RecoveryFunnel` | Visual funnel showing pipeline conversion |
| `SafetySummary` | Consent breakdown, opt-out stats, kill switch status |
| `WorkerTimeline` | Worker execution timeline with health indicators |
| `Sidebar` | Navigation with active route highlighting |
| `Topbar` | Top bar with user info |
| `Skeleton` | Loading placeholder (universal across all pages) |

---

## Appendix A: File Inventory

### Source Files

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/middleware.ts` | 1 | Edge middleware (session, routing, method guards) |
| `src/app/` | 8 pages | Frontend pages |
| `src/app/api/` | 14 routes | API endpoints |
| `src/components/` | 15 components | UI components |
| `src/lib/workers/` | 4 workers | Intelligence, Recovery, Execution, Operations |
| `src/lib/safety/` | 8 files | Consent, policies, resilience |
| `src/lib/webhook/` | 12 files | Webhook pipeline |
| `src/lib/` | 10 files | Auth, admin, design tokens, LLM, messaging, pipeline |

### Database

| Category | Count |
|----------|-------|
| Migrations | 22 |
| Tables | ~20 |
| PostgreSQL functions | 30+ |
| RLS policies | 40+ |
| Triggers | 10+ |

### Tests

| Category | Count |
|----------|-------|
| Test files | 52 |
| Total tests | 640 |
| Passing | 640 |
| Failing | 0 |

---

## Appendix B: Non-Negotiable Rules Compliance

| AGENTS.md Rule | Implementation |
|----------------|---------------|
| §3.1 Customer data is DATA, not instructions | Prompt injection defense in `sanitize.ts` |
| §3.2 LLM output is untrusted until validated | Zod schema validation on all LLM outputs |
| §3.8 No automated communication bypasses Safety | Defense-in-depth: kill switch → consent → opt-out → rate limit → circuit breaker → dispatch |
| §3.9 No automated SMS without valid consent | `checkConsentStatus()` before every outbound |
| §3.10 Opted-out customer hard-blocked | `checkOptOutStatus()` + keyword detection → BLOCK |
| §3.13 Never claim unverified revenue | "Est. Recovery" labeling, opportunity vs. actual distinction |
| §3.15 Every external side effect traceable | Trace ID propagation, audit logging on all state changes |
| §3.16 Every tenant isolated | `resolveClientId()` + `.eq('client_id', clientId)` on every query |
| §3.17 Secrets never exposed | AES-256-GCM encryption, masking in responses, never logged |
| §3.20 Rate limits and circuit breakers | HTTP rate limiter + outbound rate limiter + persistent circuit breaker |
| §3.21 Kill switch | Global + per-tenant, 2-step verification, fail-closed |
| §3.33 Never delete audit evidence | WORM triggers on audit_logs + system_audit_logs |

---

*Report generated from codebase state as of September 21, 2026.*
*All 640 tests passing. Build clean. No regressions.*
