from __future__ import annotations
import hashlib
import hmac
import json
import os
import pytest
from fastapi.testclient import TestClient
from hookledger.main import app, verified_signature

TOKEN = 'test-admin-token-at-least-24-characters'
SECRET = 'test-webhook-signature-secret'
ROUTE = {
    'title': 'Lead enrichment',
    'slug': 'lead-enrichment',
    'source': 'Formstack',
    'field': 'lead.score',
    'operator': 'greater_than',
    'expected': '70',
    'delivery_mode': 'archive',
    'enabled': True,
}

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('HOOKLEDGER_DB_PATH', str(tmp_path / 'test.db'))
    monkeypatch.setenv('HOOKLEDGER_ADMIN_TOKEN', TOKEN)
    monkeypatch.setenv('HOOKLEDGER_WEBHOOK_SECRET', SECRET)
    with TestClient(app) as c:
        yield c


def auth(): return {'Authorization': 'Bearer ' + TOKEN}


def signature(body: bytes) -> str:
    return 'sha256=' + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def create(client, **kwargs):
    payload = {**ROUTE, **kwargs}
    response = client.post('/api/routes', json=payload, headers=auth())
    assert response.status_code == 201, response.text
    return response.json()['route']


def send(client, data: dict, key: str | None = None, slug: str = 'lead-enrichment', authenticated=True):
    body = json.dumps(data).encode()
    headers = {'Content-Type': 'application/json'}
    if authenticated: headers['X-HookLedger-Signature'] = signature(body)
    if key: headers['Idempotency-Key'] = key
    return client.post('/hooks/' + slug, content=body, headers=headers)


def test_health_without_admin_token(client):
    response = client.get('/api/health')
    assert response.json()['status'] == 'ok'


def test_admin_requires_bearer(client):
    assert client.get('/api/routes').status_code == 401
    assert client.get('/api/routes', headers={'Authorization':'Bearer wrong'}).status_code == 401
    assert client.get('/api/routes', headers=auth()).status_code == 200


def test_create_and_list_routes(client):
    route = create(client)
    assert route['slug'] == 'lead-enrichment'
    rows = client.get('/api/routes', headers=auth()).json()['routes']
    assert len(rows) == 1 and rows[0]['id'] == route['id']
    assert client.post('/api/routes', json=ROUTE, headers=auth()).status_code == 409


def test_rejects_unsigned_webhooks(client):
    create(client)
    assert send(client, {'lead': {'score': 90}}, authenticated=False).status_code == 401
    assert send(client, {'lead': {'score': 90}}).status_code == 200


def test_routes_matching_and_filtered(client):
    create(client)
    accepted = send(client, {'type': 'lead.created', 'lead': {'score': 92}}, key='lead-001')
    filtered = send(client, {'type': 'lead.created', 'lead': {'score': 60}}, key='lead-002')
    assert accepted.json()['status'] == 'delivered'
    assert filtered.json()['status'] == 'filtered'
    events = client.get('/api/events', headers=auth()).json()['events']
    assert len(events) == 2
    assert events[0]['trace'][-1]['result'] == 'skipped'


def test_non_finite_webhook_number_is_filtered(client):
    create(client)
    response = send(client, {'lead': {'score': 'Infinity'}}, key='non-finite-score')
    assert response.status_code == 200
    assert response.json()['status'] == 'filtered'


def test_deduplicates_per_route_and_key(client):
    create(client)
    payload = {'lead': {'score': 91}}
    one = send(client, payload, 'unique-external-id')
    two = send(client, payload, 'unique-external-id')
    assert one.status_code == 200 and two.status_code == 200
    assert two.json()['duplicate'] is True
    assert one.json()['event_id'] == two.json()['event_id']
    assert len(client.get('/api/events', headers=auth()).json()['events']) == 1


def test_rejects_invalid_rule_and_payload(client):
    invalid = {**ROUTE, 'operator': 'exec'}
    assert client.post('/api/routes', json=invalid, headers=auth()).status_code == 422
    create(client)
    body = b'[' + b'1' + b']'
    assert client.post('/hooks/lead-enrichment', content=body, headers={'X-HookLedger-Signature': signature(body)}).status_code == 400
    oversized = b'{' + b' ' * 65536 + b'}'
    assert client.post('/hooks/lead-enrichment', content=oversized, headers={'X-HookLedger-Signature': signature(oversized)}).status_code == 413


def test_simulate_is_read_only(client):
    route = create(client)
    res = client.post('/api/simulate', json={'route_id': route['id'], 'payload': {'lead': {'score': 90}}}, headers=auth())
    assert res.status_code == 200 and res.json()['persisted'] is False
    assert len(client.get('/api/events', headers=auth()).json()['events']) == 0


def test_failed_delivery_can_replay_after_route_edit(client):
    route = create(client, delivery_mode='sandbox_failure')
    event = send(client, {'lead': {'score': 90}}, 'attempt-01').json()
    assert event['status'] == 'failed'
    changed = {**ROUTE, 'delivery_mode': 'archive'}
    patched = client.patch('/api/routes/' + route['id'], json=changed, headers=auth())
    assert patched.status_code == 200
    replay = client.post('/api/events/' + event['event_id'] + '/replay', headers=auth())
    assert replay.status_code == 200
    assert replay.json()['event']['status'] == 'delivered'
    assert replay.json()['event']['attempt_count'] == 2


def test_metrics_reflect_events(client):
    create(client)
    send(client, {'lead': {'score': 91}}, 'id-1')
    send(client, {'lead': {'score': 52}}, 'id-2')
    data = client.get('/api/metrics', headers=auth()).json()
    assert data['total'] == 2
    assert data['delivered'] == 1 and data['filtered'] == 1
    assert data['active_routes'] == 1


def test_disabled_route_returns_404(client):
    create(client, enabled=False)
    response = send(client, {'lead': {'score': 95}})
    assert response.status_code == 404


def test_no_unsigned_receive_without_secret(client, monkeypatch):
    create(client)
    monkeypatch.delenv('HOOKLEDGER_WEBHOOK_SECRET')
    response = send(client, {'lead': {'score': 95}}, authenticated=False)
    assert response.status_code == 401
    monkeypatch.setenv('HOOKLEDGER_ALLOW_UNSIGNED','1')
    assert send(client, {'lead': {'score': 95}}, authenticated=False).status_code == 200


def test_parallel_duplicate_sends_are_serialized(client):
    from concurrent.futures import ThreadPoolExecutor
    create(client)
    def call(_):
        return send(client, {'type': 'lead.created', 'lead': {'score': 83}}, 'parallel-key-123')
    with ThreadPoolExecutor(max_workers=6) as pool:
        replies = list(pool.map(call, range(10)))
    assert all(response.status_code == 200 for response in replies)
    ids = {response.json()['event_id'] for response in replies}
    assert len(ids) == 1
    assert sum(response.json()['duplicate'] is False for response in replies) == 1
    assert len(client.get('/api/events', headers=auth()).json()['events']) == 1
