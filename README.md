# HVAC Revenue Recovery

**AI-powered revenue recovery for US HVAC contractors.** Identify sent-but-unbooked estimates, missed follow-ups, and buying-intent signals — then recover that revenue through safety-gated, human-approved outreach.

**Live demo:** [https://hvac-revenue-recovery-nine.vercel.app](https://hvac-revenue-recovery-nine.vercel.app)

---

## Why it exists

HVAC contractors leak revenue every week: estimates that were sent but never booked, prospects who showed intent but went cold, and follow-ups that never happened. This system turns those leaks into a controlled recovery pipeline — without sacrificing customer trust, consent, compliance, or client control.

## How it works

```
CRM/FSM Webhook → Validate & Persist → Intelligence → Recovery → Safety → Human Approval → Execute → Audit
```

1. **Ingest** — Signed webhooks (ServiceTitan, Twilio, generic HMAC) are verified, schema-validated, de-duplicated, and stored idempotently.
2. **Intelligence Worker** — Scores opportunities, classifies risk, and recommends a strategy (LLM output is schema-validated and never trusted blindly).
3. **Recovery Worker** — Drafts follow-up messages and classifies inbound replies/intent.
4. **Safety & Policy Worker** — Deterministic consent, opt-out, client-policy, and kill-switch checks return `ALLOW` / `BLOCK` / `ESCALATE`.
5. **Human approval** — Yellow-risk customer-facing actions require approval before execution (initial deployment principle: *AI prepares → Safety validates → human approves → system executes*).
6. **Execution** — Messages go through rate limiting, circuit breakers, and the outbound queue to the messaging provider (Twilio or mock).
7. **Operations & Audit** — Every side effect is traceable; metrics, anomalies, and cost are recorded.

## Key features

- **Four-worker architecture** — Intelligence, Recovery, Safety & Policy, Operations (clear boundaries; no worker can grant itself permissions)
- **Hard safety gates** — Consent & opt-out enforcement, kill switch, rate limiters, circuit breakers, tenant isolation (RLS)
- **Webhook security** — HMAC signature verification, replay protection, 5-minute timestamp window, 1 MB payload cap, idempotency keys
- **Human-in-the-loop approvals** — Risk-classified actions (`GREEN` / `YELLOW` / `RED`) with approval workflow
- **Multi-tenant by design** — Every client is an isolated tenant at the database level
- **Prompt-injection defense** — Untrusted CRM/customer data is delimited and never treated as instructions; LLM output is Zod-validated
- **Operations dashboard** — Command Center, Recovery Pipeline, Safety, Opportunities, Tenants, Integrations, Audit
- **Fully tested** — 640 tests across 52 files (safety correctness + functional correctness)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 18, TypeScript (strict), Tailwind CSS |
| Database | Supabase (PostgreSQL) with RLS, 22 migrations |
| Auth | Supabase Auth (session middleware + route guards) |
| LLM | OpenAI-compatible SDK (works with OpenAI, Gemini proxies, etc.) |
| Validation | Zod |
| Messaging | Twilio SMS (or mock adapter for local/dev) |
| CRM/FSM | ServiceTitan webhooks (adapter-based; extensible) |
| Testing | Vitest |
| Deploy | Vercel |

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/syed-adeel872/hvac-revenue-recovery.git
cd hvac-revenue-recovery
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see the annotated `.env.example` for every variable):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-side only — never expose) |
| `DATABASE_URL` | Direct Postgres connection (migrations/psql) |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | OpenAI-compatible LLM endpoint |
| `CRON_SECRET` | Shared secret for cron/job endpoints — `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 32-byte hex for AES-256-GCM credential encryption — `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Dashboard admin (password ≥ 12 chars) |
| `MESSAGING_PROVIDER` | `mock` (default) or `twilio` |
| `TWILIO_*` | Twilio credentials when using real SMS |
| `APP_URL` | Public app URL (Twilio callbacks) |

> **Never commit `.env.local`.** It is gitignored; only `.env.example` (placeholders) is tracked.

### 3. Set up the database

```bash
npm run migrate        # runs all 22 migrations
npm run verify:db      # verifies tables, functions, RLS
```

### 4. Seed the admin user

```bash
npm run seed:admin     # creates ADMIN_EMAIL user + default tenant membership
```

### 5. Run

```bash
npm run dev            # http://localhost:3000
```

Sign in at `/login` with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### 6. Test

```bash
npm test               # 640 tests
npm run build          # production build
```

## Project structure

```
hvac-revenue-recovery/
├── AGENTS.md                 # Operating rules & safety invariants (authoritative)
├── ARCHITECTURE.md           # Full architecture & security posture report
├── .env.example              # Environment template (safe to commit)
├── supabase/migrations/      # 000001–000022 sequential SQL migrations
├── scripts/                  # migrate, verify:db, seed:admin, load-env, simulate
├── src/
│   ├── middleware.ts         # Session, route guards, method guards
│   ├── app/                  # Dashboard pages + API routes
│   │   ├── api/v1/webhooks/  # ServiceTitan, Twilio, [provider_name]
│   │   ├── api/v1/jobs/      # process-webhooks, run-pipeline (cron)
│   │   └── api/v1/admin/     # stats, safety, kill-switch, actions, tenants, …
│   ├── components/           # Dashboard shell, KPI, funnel, safety, tables
│   └── lib/
│       ├── workers/          # intelligence | recovery | execution | operations
│       ├── safety/           # consent, policy, evaluate-safety, resilience/
│       ├── webhook/          # verify, validate, encrypt, persist, processors
│       ├── messaging/        # Twilio + mock adapters
│       └── pipeline/         # Orchestrator
└── tests/                    # 52 Vitest suites (640 tests)
```

## Safety model (non-negotiable)

- Customer data is **data**, not instructions — LLM output is untrusted until schema-validated.
- No outbound SMS without valid consent; opted-out customers are hard-blocked.
- Unknown consent → `ESCALATE`, never silent allow.
- Global **kill switch** stops all automation; no AI worker can disable it.
- Every external side effect is auditable and tenant-scoped.
- Yellow-risk customer-facing actions require human approval in the initial deployment.

See [`AGENTS.md`](./AGENTS.md) for the full rule set and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the detailed architecture and security posture.

## Deploy

Production is deployed on Vercel:

```bash
vercel --prod
```

Configure the same environment variables in Vercel Project Settings. Cron jobs are defined in `vercel.json`.

## License

Private / All rights reserved (Project Owner: Adeel).
