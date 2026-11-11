# Architecture overview

HookLedger is split into two independent deliverables:

1. **UI sandbox** — Vite/React/TypeScript application. Rules and event traces run locally in the browser; generated fixtures populate charts; localStorage persists demo changes. This is the public hosted preview.
2. **Python API** — FastAPI, Pydantic, SQLite. An admin token controls routes/events/metrics; HMAC verifies inbound events. SQLite stores route configurations, payloads, event status, trace, dedupe key and replay attempts.

```mermaid
flowchart LR
  S[Webhook producer] --> H[POST /hooks/{slug}]
  H -->|64 KB limit + HMAC| V[Validate]
  V -->|BEGIN IMMEDIATE| I[Idempotency lookup]
  I --> R[Condition engine]
  R -->|match| A[Archive in SQLite]
  R -->|no match| F[Filtered event]
  R -->|failure mode| X[Failed event]
  A --> T[Trace inspector]
  F --> T
  X --> T
  T -->|Manual replay| R
```

## Event lifecycle

- `delivered`: locally archived **only**, with complete trace. No external webhook target is contacted.
- `filtered`: condition is false, and an explicit `skipped` delivery step explains why.
- `failed`: sandbox failure route selected. Replay becomes useful after fixing the rule or changing the mode.

## Ingestion sequence

1. Validate slug and maximum payload length.
2. Verify HMAC with the raw request bytes (unless unsigned development is deliberately enabled).
3. Parse a JSON object. Reject arrays, invalid JSON and oversized bodies.
4. Begin an immediate SQLite write transaction.
5. Check unique `(route_id, dedupe_key)` for duplicate senders.
6. Execute the restricted rule engine; record an event and trace atomically.
7. Respond with event ID, status, and duplicate flag.

## Matching model

Supported operators: `equals`, `contains`, `greater_than`, `exists`. Conditions point to at most six nested JSON object keys via dot-delimited paths. No arbitrary Python or JavaScript evaluation is allowed. Only one AND-free condition per route in this MVP.

## Intentional limits

- No message queue, asynchronous automatic retry or third-party destination delivery.
- No multi-user authentication or per-tenant roles.
- No encryption at rest or retention scheduler.
- SQLite is suited for the local demo and small controlled installations, not horizontally scaled ingestion.

This project's goal is to demonstrate **correct reliability primitives**, not to make misleading enterprise scalability claims.
