# Security model

## Supported protections

- **Admin authentication:** all route, event, metrics, replay and simulation endpoints require `Authorization: Bearer $HOOKLEDGER_ADMIN_TOKEN`. The token must have at least 20 characters. It is never sent to public webhooks.
- **Webhook signatures:** `X-HookLedger-Signature: sha256=<hex digest>` signs exact raw request bytes with `HOOKLEDGER_WEBHOOK_SECRET`. Constant-time verification. If no secret is configured, inbound requests fail closed unless `HOOKLEDGER_ALLOW_UNSIGNED=1` is explicitly set.
- **Idempotency:** unique `(route_id, dedupe_key)` constraint, combined with `BEGIN IMMEDIATE` to serialize writes.
- **Input limits:** 64 KiB webhook request cap, restricted JSON object input, validated endpoint slugs and model fields.
- **No arbitrary code:** condition engine does not use `eval`, templates or user-supplied executable code.
- **No external delivery:** archive and deliberate sandbox failure are the only delivery modes.
- **CORS:** configured from `HOOKLEDGER_CORS_ORIGINS`, defaults to local Vite address.
- **No analytics tracking:** the demo does not send behavioral data to external tracking vendors.

## Production hardening required

Before operating with customer data, implement per-user authentication, rate limiting at the edge, short-lived access tokens, encrypted secrets, privacy-compliant retention and deletion, backups and a database appropriate to expected scale. If outbound delivery is added, require an explicitly configured host allowlist and defenses against SSRF (including private IPs, redirects and DNS rebinding), secure credential storage, scheduled retries with backoff, dead-letter queue, and delivery audit logs.

**Do not expose admin secrets or process sensitive payment/customer payloads in the public sandbox.**

## Reporting vulnerabilities

Please open a private security advisory in the future repository, or contact its maintainer via the channel listed on the developer profile. Do not post live secrets or customer records in public issues.
