# Architecture Diagrams

Structured HLD/LLD diagrams for the account self-service chatbot. All are plain
SVG (no build step) and render directly on GitHub.

## HLD - System architecture

Three lanes: browser client, Next.js server pipeline, and managed services. The
key idea is the **one-directional trust boundary** - free customer text enters
the parser, but only *deterministic, validated* code ever writes to the
database or sends email.

![HLD system architecture](./hld-system-architecture.svg)

## LLD - Request pipeline & action state machine

How a single message travels top-to-bottom. Reads exit early with no side
effects; writes must pass validation (and, for money/deletes, an explicit
confirm) before they persist and trigger a notification.

![LLD request pipeline](./lld-request-pipeline.svg)

## LLD - Sequence: update phone number

An end-to-end mutating action, showing the audit-event write and the
build-encrypt-send notification steps. Logs are redacted at every hop.

![LLD sequence update phone](./lld-sequence-update-phone.svg)

## LLD - Data model (ERD)

The 7 starter tables plus 3 additions (★): `account_change_events` for
audit/undo, and `conversations` + `chat_messages` for slot-filling state and
explainability.

![LLD data model ERD](./lld-data-model-erd.svg)
