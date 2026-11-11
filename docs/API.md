# API reference

OpenAPI is generated automatically at `http://localhost:8000/docs` when FastAPI is running.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | Service health |
| GET | `/api/routes` | Admin token | Route list |
| POST | `/api/routes` | Admin token | Create a route |
| PATCH | `/api/routes/{route_id}` | Admin token | Modify rule or mode |
| POST | `/hooks/{slug}` | Webhook HMAC | Ingest event |
| POST | `/api/simulate` | Admin token | Dry-run a payload without persistence |
| GET | `/api/events` | Admin token | Event history, filter by status or route |
| POST | `/api/events/{event_id}/replay` | Admin token | Re-evaluate using current route config |
| GET | `/api/metrics` | Admin token | Aggregate metrics |

### Example route

```json
{
  "title": "Lead qualification",
  "slug": "lead-qualification",
  "source": "Website forms",
  "field": "lead.score",
  "operator": "greater_than",
  "expected": "65",
  "delivery_mode": "archive",
  "enabled": true
}
```

### Signed webhook

```bash
BODY='{"type":"lead.created","lead":{"score":87}}'
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HOOKLEDGER_WEBHOOK_SECRET" -hex | awk '{print $2}')

curl -X POST http://localhost:8000/hooks/lead-qualification \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: lead-external-0001" \
  -H "X-HookLedger-Signature: sha256=$SIGNATURE" \
  -d "$BODY"
```

Response:

```json
{"event_id":"a-generated-uuid","status":"delivered","duplicate":false}
```

Resending the exact idempotency key for the same route produces `duplicate: true` and returns the initial ID, without creating an extra event.

### Manual replay

A replay increments `attempt_count` and replaces status/trace with an evaluation against the current route configuration. Replay is limited to 10 attempts. Replaying does not contact an external provider.

### Test sender

`backend/scripts/demo_sender.py` creates a correctly signed request and sends synthetic input to a local endpoint. It requires the webhook secret environment variable.
