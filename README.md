# Account Self-Service Chatbot

An AI chatbot that lets a customer with an overdue account manage everything by
chatting in plain English - read and update their details, add people who can
act for them, make (mocked) payments, set promises to pay, and book agent calls.
Every change is persisted, audited, and confirmed by email with an encrypted PDF.

**🔗 Live demo:** https://account-self-service-chatbot.vercel.app/
**🏗️ Architecture:** [architecture-diagram.md](./architecture-diagram.md) · detailed HLD/LLD in [docs/diagrams](./docs/diagrams)
**🎬 Demo video:** [watch the walkthrough](https://github.com/IronNathanAlvares/account-self-service-chatbot/releases/download/demo-v1/demo-video.mp4)

> Built on the PayPathIQ starter template. Sign in is a **mock gateway** (no real
> auth, per the brief) - any credentials continue as the demo account.

---

## Demo video

A full walkthrough is hosted as a GitHub release asset (about 200 MB, so it is
attached to the release rather than committed to the repo):

**[Watch the demo video](https://github.com/IronNathanAlvares/account-self-service-chatbot/releases/download/demo-v1/demo-video.mp4)**
&nbsp;·&nbsp; [release page](https://github.com/IronNathanAlvares/account-self-service-chatbot/releases/tag/demo-v1)

It covers reads, updates with validation, related people with slot-filling, a
mocked payment with the confirmation gate and a custom receipt email, a promise
to pay, a booking, the encrypted-PDF email, the audit trail, and undo (including
that it deliberately refuses to reverse a payment).

---

## What it does

Chat with the floating assistant (bottom-right) and try:

| You say | It does |
| --- | --- |
| "What's my email?" / "How much do I owe?" | Reads the specific detail |
| "Change my phone to +353831112233" | Validates + persists + emails an encrypted PDF |
| "Add my brother Mark so he can act for me" | Asks for the missing details, then adds him |
| "Pay 150 euro now" | Asks you to **confirm**, then records the payment + deducts the balance |
| "Can I pay 500 on the 1st of next month?" | Records a promise to pay |
| "Book a call next Tuesday at 10am" | Books a future appointment (rejects past dates) |
| "Show my transactions" / "my promises" | Lists them |

The **Activity** tab shows a full audit trail (what changed, when, and a
before/after snapshot).

## Feature checklist

- ✅ Read/update account holder (name, email, phone, address) with validation
- ✅ Preferred contact method (email/sms/phone)
- ✅ Related people: add / read / (authorized-to-act flag)
- ✅ One-time promises to pay
- ✅ Mocked payments with balance deduction, idempotency, and **confirmation**
- ✅ Transaction history · Future call appointments (past-date rejection)
- ✅ Email notification with **encrypted PDF** (password = phone last-4)
- ✅ Multi-turn slot-filling + two-phase confirm for money actions
- ✅ Persisted in Supabase · audit trail · tests for the core action logic

## Tech stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Supabase
(Postgres) · Resend · `pdf-lib` + `@pdfsmaller/pdf-encrypt-lite` · Vitest.
LLM parsing via any OpenAI-compatible provider (Groq / Gemini / OpenRouter /
Ollama / Anthropic).

---

## Getting started (local)

```bash
git clone https://github.com/IronNathanAlvares/account-self-service-chatbot.git
cd account-self-service-chatbot
pnpm install
```

**1. Environment** - copy `.env.local.example` to `.env.local` and fill in. The
app runs with zero config (in-memory data + a local model), but a full setup uses:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=sb_secret_...          # server only, bypasses RLS
RESEND_API_KEY=re_...                      # optional locally (logs if unset)
NOTIFICATION_FROM_EMAIL=onboarding@resend.dev
GROQ_API_KEY=gsk_...                       # or OLLAMA_MODEL=mistral:latest for local
```

**2. Database** - start Supabase locally (needs Docker) and apply migrations:

```bash
supabase start
supabase db reset      # applies migrations + seeds the demo account
```

Full details, including the atomic-payment function and RLS notes, are in
[docs/DATABASE_SETUP.md](./docs/DATABASE_SETUP.md).

**3. Run**

```bash
pnpm dev        # http://localhost:3000
pnpm test       # core action-logic tests
pnpm typecheck && pnpm lint
```

## Deployment (Vercel + hosted Supabase)

1. Create a project on [supabase.com](https://supabase.com/dashboard), then
   `supabase login && supabase link --project-ref <ref> && supabase db push`.
2. Import the repo into Vercel.
3. Add the env vars above (using the **hosted** project URL/keys and a cloud LLM
   key such as Groq) in Vercel → Settings → Environment Variables, then redeploy.

Every push to `main` triggers a new Vercel deployment.

---

## Architecture

The system is a thin Next.js UI over a layered, server-side pipeline. The single
most important design choice is the **one-directional trust boundary**: free
customer text enters the parser, but only deterministic, validated code ever
writes to the database or sends email. The LLM classifies; it never acts.

![HLD system architecture](./docs/diagrams/hld-system-architecture.svg)

The detailed HLD/LLD set (request pipeline and state machine, an end-to-end
sequence, and the data model) lives in [docs/diagrams](./docs/diagrams), each
with a short note on why it exists and what it shows. In short:

- **Request pipeline / state machine** - where the safety rules live: reads exit
  early; writes validate; money and destructive actions require confirmation;
  missing details trigger multi-turn slot-filling.
- **Sequence (update phone)** - a concrete mutating action, including the audit
  write and the build/encrypt/send notification steps, with redacted logs.
- **Data model (ERD)** - the starter tables plus an audit trail and a payment
  idempotency key. Conversation state is carried by the client each turn, so the
  API functions stay stateless.

---

## Design note

**Architecture.** The system is a thin Next.js UI over a layered, server-side
pipeline: `message → parse (LLM) → route → validate → execute → persist →
notify → audit`. The single most important decision is that **the LLM only
classifies** - it turns free text into a structured `{action, fields,
confidence}` and never touches the database. Deterministic code owns all
validation and writes. This is both the correctness story (state transitions are
explicit and testable) and the security story (a prompt-injection attempt can, at
worst, produce an intent that then fails validation).

**Layering & testability.** Persistence and notifications sit behind interfaces
(`AccountRepository`, `Notifier`). The action router depends only on those, so
the whole core runs in tests against an in-memory repository and a spy notifier -
no network, no database, no email. The same router runs in production against
Supabase and Resend. The parser is provider-agnostic (any OpenAI-compatible
endpoint), so the model is a config choice, not a code change.

**Data model.** Seven tables from the starter plus three additions:
`account_change_events` (before/after audit trail powering the Activity view),
and a `transactions.idempotency_key` so a retried payment can't double-charge.
Payments run through an atomic Postgres function that locks the row, validates,
inserts the transaction, and deducts the balance in one transaction. Money is
integer cents throughout.

**Safety.** Two-phase confirmation gates money actions (nothing is charged
without an explicit "yes"). Sensitive detail never appears in the email body - it
goes in an encrypted PDF (RC4-128 via a pure-JS library that runs on serverless,
no native binary). Logs are redacted (email/phone/password masked). Multi-turn
slot-filling asks for missing details instead of guessing.

**Tradeoffs / assumptions.** No auth system (per the brief) - sign-in is a mock
gateway and there is one demo account. PDF encryption is RC4-128, chosen for
serverless portability; AES-256 via qpdf is the upgrade path. Conversation state
is carried by the client between turns rather than persisted, which keeps the
functions stateless and is fine at this scope. Read-only starter context (billing
due date, support numbers) is synthesized from constants.

**How I'd improve, monitor, and evolve it.** *Monitor:* structured request logs
(intent, confidence, latency, outcome) shipped to a dashboard; alerts on
notification-send failures and parser error rates; the `account_change_events`
table already gives per-account observability and a natural “undo”. *Improve:* an
LLM eval harness (golden natural-language prompts → expected intents, tracked as
an accuracy metric) to guard prompt/model changes; persist conversations for
real multi-session memory; add inline confirm cards and streaming replies. *Evolve:*
real auth + RLS per user, a verified email domain, webhooks for payment
providers, and a small router that keeps the cheap deterministic fast-path for
common reads while escalating only ambiguous messages to the LLM - keeping cost
and latency low as volume grows.

---

## Repository map

- `src/app` - landing (`/`), portal (`/portal`), API routes (`/api/chat`, `/api/account`, `/api/audit`)
- `src/lib/chat` - intent parsing, action router, validation, turn orchestration
- `src/lib/account` - repository interface + Supabase/in-memory implementations, audit
- `src/lib/notifications` - notifier boundary, Resend, encrypted-PDF pipeline
- `supabase/migrations` - schema, seed, grants, payment function
- `docs/` - [database setup](./docs/DATABASE_SETUP.md), [diagrams](./docs/diagrams), [PDF research](./docs/research/pdf-encryption.md)
