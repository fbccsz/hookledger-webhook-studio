# Project brief — why HookLedger

## Research context (11 November 2026)

The following public freelance briefs describe recurring needs. They are inspiration for a portfolio case, not clients or commissions received by its author.

1. **Workana — Backend Developer Needed for Webhook and API Automation (July 2026).** Requires Python/FastAPI, webhook validation, persistent records, duplicate prevention with submission IDs, successful/failed logs, and a documented/tested deliverable. Source: https://www.workana.com/pt/job/backend-developer-needed-for-webhook-and-api-automation
2. **Upwork — n8n Developer Needed for Business Workflow Integration (10 November 2026).** Requires REST/webhooks, conditions, transformations, error handling, tests, and handover. Source: https://www.upwork.com/freelance-jobs/apply/n8n-Automation-Developer-Needed-for-Business-Workflow-Integration_~022120105235745939927/
3. **Workana — Dashboard com Integração de APIs e Automação de Dados (31 October 2026).** Requests multi-source dashboard, historical data, deduplication, monitoring, credential security and resilient backend. Source: https://www.workana.com/pt/job/desenvolvimento-de-dashboard-com-integracao-de-apis-e-automacao-de-dados

## Portfolio goal

Show the ability to design and implement reliable integration primitives in Python and pair them with a polished operator experience in React/TypeScript. The project complements business-CRM work rather than repeating it.

## Product thesis

Most integration tools demonstrate happy-path success; HookLedger makes the debugging lifecycle visible: why an event passed, failed or was filtered, how duplicates are blocked, and what changes on replay.

## Scope

**Implemented:** HMAC, SQLite idempotency, rule evaluation, trace steps, replay, route CRUD, API docs, 7-day metrics, interactive browser sandbox, JSON route export, CSV event export, tests.

**Explicitly out of scope:** real destination delivery, automated retry queues, multi-tenant hosting, payment handling, AI agents, external OAuth credentials and production customer data.

## Evaluation criteria

- Can a developer understand and run the backend locally from README alone?
- Are duplicate signed events stored exactly once?
- Does a failed event remain inspectable and re-evaluate after a route is updated?
- Does the UI clearly distinguish synthetic demo data from real backend data?
- Can the interface be used on desktop and mobile?
- Do automated tests pass for backend and frontend logic?
