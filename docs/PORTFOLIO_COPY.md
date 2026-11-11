# Portfolio entry — HookLedger

Use the following concise copy when the new GitHub repository is published.

## Featured repository description (English)

**HookLedger — A webhook reliability laboratory built with Python/FastAPI, React and TypeScript.** Receive signed events, prevent duplicates, debug conditional routes, inspect execution traces and replay failures. Includes a full interactive sandbox and a tested SQLite-backed API.

**Topics:** `python`, `fastapi`, `typescript`, `react`, `webhooks`, `api-integration`, `observability`, `automation`, `sqlite`, `hmac`, `idempotency`, `developer-tools`

## GitHub profile snippet

```md
### [HookLedger](https://github.com/fbccsz/hookledger-webhook-studio) — Webhook Reliability Studio

**Python · FastAPI · React · TypeScript · SQLite · Vite**

A local-first integration debugging console with a signed webhook API, deduplication, configurable rules, execution traces and manual replay. Built as a functional portfolio project inspired by real API/automation freelance requirements.

[Live sandbox](https://hookledger-webhook-studio.vercel.app) · [Source code](https://github.com/fbccsz/hookledger-webhook-studio)
```

**Important:** the GitHub URL above is a publishing target only. It is not an existing repository until created and populated. Keep the live demo and source URLs separate until publication is verified.

## Short Portuguese pitch

> Desenvolvi o HookLedger, um laboratório de confiabilidade para integrações via webhook. O backend em Python/FastAPI valida assinaturas HMAC, impede eventos duplicados e armazena o histórico em SQLite. A interface em React/TypeScript permite configurar regras, simular payloads, analisar rastros de execução e reprocessar falhas. O projeto inclui testes automatizados e demonstração navegável, sem depender de serviços pagos.

## Interview talking points

1. Why idempotency keys are constrained by route and enforced in a SQL transaction.
2. Why HMAC must sign the raw bytes of the payload before JSON parsing.
3. Why arbitrary expression evaluation was deliberately excluded from the routing engine.
4. How replay changes only the event's processing state, without cloning the event record.
5. How the public browser sandbox differs from the authenticated Python API.
6. What a production-ready outgoing queue and retry strategy would require.
