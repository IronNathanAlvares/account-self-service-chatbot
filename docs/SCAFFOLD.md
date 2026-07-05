# Scaffold map

Structure added on `feat/action-router-scaffold`. Everything is layered so each
piece is unit-testable in isolation and the LLM never touches persistence.

```
src/lib/
  money.ts                         cents helpers (+ tests)
  redact.ts                        PII/secret redaction for logs
  chat/
    intent/
      intent-types.ts              ParsedIntent, IntentParser interface
      rule-based-parser.ts         deterministic fast-path for reads (+ tests)
      llm-parser.ts                Claude tool-use → structured intent (boundary)
      parse-intent.ts              hybrid: rules → LLM, graceful fallback
    validation/
      validators.ts                zod schemas + validate() (+ tests)
    router/
      action-router.ts             THE core: validate → execute → notify (+ tests)
    chat-service.ts                composition root (env-based wiring)
  account/
    repository.ts                  AccountRepository interface (the DB seam)
    in-memory-repository.ts        fake for tests + zero-config local dev
    supabase-repository.ts         production impl (stubbed, ready to fill in)
  supabase/
    server-client.ts               service-role client (server only)
  notifications/
    notifier.ts                    Notifier interface + Logging/Recording impls
    resend-notifier.ts             production: build → encrypt → send
    pdf/
      build-account-pdf.ts         pdf-lib content
      encrypt-pdf.ts               pdf-encrypt-lite wrapper (pwd = phone last-4)
src/app/api/chat/route.ts          wired to handleChat() (Node runtime)
```

## Design rules baked in

1. **The LLM only classifies.** It returns `{action, fields, confidence}` and
   never executes a write - the deterministic router + validators do. This is
   also the prompt-injection defense.
2. **Everything I/O is an interface.** `AccountRepository` and `Notifier` let the
   whole action core run in tests with zero external services.
3. **Notify only on data change**, with a redacted summary; sensitive detail
   goes in the encrypted PDF, never the email body or logs.
4. **Money is integer cents**, payments are idempotent, and payments larger than
   the balance are rejected before any write.

## Status

- ✅ `pnpm typecheck`, `pnpm test` (20 passing), `pnpm lint` all green.
- ✅ Deterministic core fully implemented + tested against the in-memory repo.
- ⏳ To fill in: `SupabaseAccountRepository`, the audit-event + conversation
   tables, two-phase confirm, and a preview-deploy test of the encrypted PDF.

## Run

```powershell
pnpm i
pnpm test
pnpm dev   # works with zero config (in-memory repo + logging notifier)
```
