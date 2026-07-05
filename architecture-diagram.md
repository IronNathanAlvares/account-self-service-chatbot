# Architecture Diagram

High-level architecture of the account self-service chatbot. Detailed HLD/LLD
diagrams (system, request pipeline, sequence, ER model) are in
[docs/diagrams](./docs/diagrams).

**Core principle:** free customer text enters the parser, but only
deterministic, validated code ever writes to the database or sends email - the
LLM classifies, it never acts.

```mermaid
flowchart TB
  subgraph Client["Browser - Next.js / React"]
    UI["Account portal<br/>(dashboard · activity · floating chat)"]
  end

  subgraph Server["Next.js server · /api (Node runtime)"]
    direction TB
    Turn["Turn orchestrator<br/>(slot-filling · confirmation)"]
    Parser["Intent parser (LLM)<br/>message → {action, fields, confidence}"]
    Router["Action router (deterministic dispatch)"]
    Valid["Validators (zod)"]
    Repo["Account repository (interface)"]
    Notif["Notifier (interface)"]
    PDF["Encrypted PDF builder"]
    Audit["Audit writer"]
  end

  subgraph External["Managed services (free tier)"]
    DB[("Supabase Postgres<br/>+ audit + payment RPC")]
    LLM["LLM API<br/>(Groq / Gemini / Ollama / ...)"]
    Email["Resend"]
  end

  UI -->|"POST /api/chat (+pending)"| Turn
  Turn --> Parser --> LLM
  Turn --> Router --> Valid
  Router --> Repo --> DB
  Router --> Notif
  Notif --> PDF
  Notif --> Email
  Router --> Audit --> DB
  DB -->|"GET /api/account · /api/audit"| UI
  Router -->|"ChatActionResult (+cards, +pending)"| UI
```

## Request lifecycle

`message → parse (LLM) → route → validate → execute → persist → notify → audit → structured reply`

- **Reads** return early with no side effects.
- **Writes** must pass validation; **money/destructive actions require an
  explicit confirmation**; missing details trigger multi-turn slot-filling.
- On any data change, a generic email is sent with sensitive detail in an
  **encrypted PDF**, and a before/after row is written to `account_change_events`.
