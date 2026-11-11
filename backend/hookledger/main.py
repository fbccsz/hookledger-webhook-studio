"""HookLedger HTTP API.

Administrative endpoints require a bearer token. Inbound webhooks require an HMAC
signature unless unsigned local development is explicitly enabled. This MVP
archives events; it does not send emails or perform external deliveries.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from .db import connect, init_db, route_dict, event_dict
from .engine import evaluate_rule, resolve_status, OPERATORS


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def require_admin(authorization: Annotated[str | None, Header()] = None):
    expected = os.environ.get('HOOKLEDGER_ADMIN_TOKEN', '')
    if len(expected) < 20:
        raise HTTPException(status_code=503, detail='admin_token_not_configured')
    supplied = authorization.removeprefix('Bearer ') if authorization else ''
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail='unauthorized')


class RouteInput(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    slug: str = Field(min_length=3, max_length=60, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    source: str = Field(min_length=2, max_length=60)
    field: str = Field(min_length=1, max_length=96)
    operator: Literal['equals', 'contains', 'greater_than', 'exists']
    expected: str = Field(default='', max_length=150)
    delivery_mode: Literal['archive', 'sandbox_failure'] = 'archive'
    enabled: bool = True

    @field_validator('field')
    @classmethod
    def valid_path(cls, v: str) -> str:
        if len(v.split('.')) > 6 or not all(s.isidentifier() for s in v.split('.')):
            raise ValueError('invalid_json_path')
        return v


class SimulationInput(BaseModel):
    route_id: str = Field(min_length=10, max_length=60)
    payload: dict[str, Any]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db(path())
    yield

app = FastAPI(title='HookLedger API', version='1.0.0', description='Webhook ingestion, routing and replay observability.', lifespan=lifespan)
origins = [x.strip() for x in os.environ.get('HOOKLEDGER_CORS_ORIGINS', 'http://localhost:5173').split(',') if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Authorization', 'Content-Type', 'X-HookLedger-Signature', 'Idempotency-Key'])


def path() -> str:
    return os.environ.get('HOOKLEDGER_DB_PATH', './hookledger.db')




@app.get('/api/health')
def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'hookledger', 'version': '1.0.0'}


@app.get('/api/routes', dependencies=[Depends(require_admin)])
def list_routes() -> dict[str, list[dict[str, Any]]]:
    with connect(path()) as db:
        rows = db.execute('SELECT * FROM routes ORDER BY created_at DESC').fetchall()
    return {'routes': [route_dict(row) for row in rows]}


@app.post('/api/routes', status_code=201, dependencies=[Depends(require_admin)])
def create_route(data: RouteInput) -> dict[str, dict[str, Any]]:
    route_id = str(uuid.uuid4())
    created_at = now_iso()
    with connect(path()) as db:
        existing = db.execute('SELECT 1 FROM routes WHERE slug=?', (data.slug,)).fetchone()
        if existing:
            raise HTTPException(409, 'route_slug_exists')
        db.execute('INSERT INTO routes (id,slug,title,source,field,operator,expected,delivery_mode,enabled,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                   (route_id, data.slug, data.title, data.source, data.field, data.operator, data.expected, data.delivery_mode, int(data.enabled), created_at))
        row = db.execute('SELECT * FROM routes WHERE id=?', (route_id,)).fetchone()
    return {'route': route_dict(row)}


@app.patch('/api/routes/{route_id}', dependencies=[Depends(require_admin)])
def update_route(route_id: str, data: RouteInput) -> dict[str, dict[str, Any]]:
    with connect(path()) as db:
        if not db.execute('SELECT 1 FROM routes WHERE id=?', (route_id,)).fetchone():
            raise HTTPException(404, 'route_not_found')
        conflict = db.execute('SELECT 1 FROM routes WHERE slug=? AND id!=?', (data.slug, route_id)).fetchone()
        if conflict:
            raise HTTPException(409, 'route_slug_exists')
        db.execute('UPDATE routes SET slug=?,title=?,source=?,field=?,operator=?,expected=?,delivery_mode=?,enabled=? WHERE id=?',
                   (data.slug, data.title, data.source, data.field, data.operator, data.expected, data.delivery_mode, int(data.enabled), route_id))
        row = db.execute('SELECT * FROM routes WHERE id=?', (route_id,)).fetchone()
    return {'route': route_dict(row)}


def verified_signature(body: bytes, signature: str | None) -> bool:
    secret = os.environ.get('HOOKLEDGER_WEBHOOK_SECRET', '')
    if not secret:
        return os.environ.get('HOOKLEDGER_ALLOW_UNSIGNED', '') == '1'
    if not signature or not re.fullmatch(r'sha256=[0-9a-fA-F]{64}', signature):
        return False
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest('sha256=' + digest, signature.lower())


def process(db, route, payload: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    matched, trace = evaluate_rule(payload, route['field'], route['operator'], route['expected'])
    status, final_step = resolve_status(matched, route['delivery_mode'])
    trace.append(final_step)
    return status, trace


@app.post('/hooks/{slug}')
async def receive(slug: str, request: Request, idempotency_key: Annotated[str | None, Header()] = None, x_hookledger_signature: Annotated[str | None, Header()] = None):
    if len(slug) > 60 or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
        raise HTTPException(404, 'route_not_found')
    if idempotency_key is not None and (len(idempotency_key) < 1 or len(idempotency_key) > 120 or not idempotency_key.isascii()):
        raise HTTPException(400, 'invalid_idempotency_key')
    length = request.headers.get('content-length')
    if length:
        try:
            if int(length) > 65536:
                raise HTTPException(413, 'payload_too_large')
        except ValueError:
            raise HTTPException(400, 'invalid_content_length') from None
    body = await request.body()
    if len(body) > 65536:
        raise HTTPException(413, 'payload_too_large')
    if not verified_signature(body, x_hookledger_signature):
        raise HTTPException(401, 'invalid_signature')
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, ValueError):
        raise HTTPException(400, 'invalid_json') from None
    if not isinstance(payload, dict):
        raise HTTPException(400, 'json_object_required')
    start = time.perf_counter()
    with connect(path()) as db:
        # Serialize readers and writers so duplicate checks remain transactional.
        db.execute('BEGIN IMMEDIATE')
        route = db.execute('SELECT * FROM routes WHERE slug=?', (slug,)).fetchone()
        if not route or not route['enabled']:
            raise HTTPException(404, 'route_not_found')
        if idempotency_key:
            prior = db.execute('SELECT id,status FROM events WHERE route_id=? AND dedupe_key=?', (route['id'], idempotency_key)).fetchone()
            if prior:
                return {'event_id': prior['id'], 'status': prior['status'], 'duplicate': True}
        status, trace = process(db, route, payload)
        event_id = str(uuid.uuid4())
        timestamp = now_iso()
        latency_ms = max(1, round((time.perf_counter() - start) * 1000))
        try:
            db.execute('INSERT INTO events (id,route_id,event_type,status,payload,dedupe_key,attempt_count,latency_ms,trace,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       (event_id, route['id'], str(payload.get('type', 'event.received'))[:80], status, json.dumps(payload), idempotency_key, 1, latency_ms, json.dumps(trace), timestamp, timestamp))
        except Exception as e:
            if idempotency_key and 'UNIQUE constraint failed' in str(e):
                prior = db.execute('SELECT id,status FROM events WHERE route_id=? AND dedupe_key=?', (route['id'], idempotency_key)).fetchone()
                if prior:
                    return {'event_id': prior['id'], 'status': prior['status'], 'duplicate': True}
            raise
    return {'event_id': event_id, 'status': status, 'duplicate': False}


@app.post('/api/simulate', dependencies=[Depends(require_admin)])
def simulate(data: SimulationInput):
    with connect(path()) as db:
        route = db.execute('SELECT * FROM routes WHERE id=?', (data.route_id,)).fetchone()
        if not route:
            raise HTTPException(404, 'route_not_found')
        status, trace = process(db, route, data.payload)
    return {'status': status, 'trace': trace, 'persisted': False}


@app.get('/api/events', dependencies=[Depends(require_admin)])
def events(status: str | None = None, route_id: str | None = None, limit: int = 100):
    if limit < 1 or limit > 500:
        raise HTTPException(400, 'invalid_limit')
    where = ['1=1']
    args: list[Any] = []
    if status:
        if status not in ('delivered', 'filtered', 'failed'):
            raise HTTPException(400, 'invalid_status')
        where.append('e.status=?')
        args.append(status)
    if route_id:
        where.append('e.route_id=?')
        args.append(route_id)
    sql = ('SELECT e.*, r.title AS route_title, r.slug AS route_slug FROM events e JOIN routes r ON r.id=e.route_id WHERE '
           + ' AND '.join(where) + ' ORDER BY e.created_at DESC LIMIT ?')
    with connect(path()) as db:
        rows = db.execute(sql, (*args, limit)).fetchall()
    return {'events': [event_dict(row) for row in rows]}


@app.post('/api/events/{event_id}/replay', dependencies=[Depends(require_admin)])
def replay(event_id: str):
    with connect(path()) as db:
        row = db.execute('SELECT * FROM events WHERE id=?', (event_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'event_not_found')
        route = db.execute('SELECT * FROM routes WHERE id=?', (row['route_id'],)).fetchone()
        if not route or not route['enabled']:
            raise HTTPException(409, 'route_disabled')
        if row['attempt_count'] >= 10:
            raise HTTPException(409, 'max_replay_attempts')
        status, trace = process(db, route, json.loads(row['payload']))
        trace.insert(0, {'step': 'replay', 'result': 'ok', 'detail': f'Attempt {row["attempt_count"] + 1}'})
        db.execute('UPDATE events SET status=?,attempt_count=attempt_count+1,trace=?,updated_at=? WHERE id=?',
                   (status, json.dumps(trace), now_iso(), event_id))
        updated = db.execute('SELECT e.*,r.title AS route_title,r.slug AS route_slug FROM events e JOIN routes r ON r.id=e.route_id WHERE e.id=?', (event_id,)).fetchone()
    return {'event': event_dict(updated)}


@app.get('/api/metrics', dependencies=[Depends(require_admin)])
def metrics():
    with connect(path()) as db:
        rows = db.execute('SELECT status,COUNT(*) AS total FROM events GROUP BY status').fetchall()
        routes_count = db.execute('SELECT COUNT(*) FROM routes WHERE enabled=1').fetchone()[0]
        days = db.execute('SELECT substr(created_at,1,10) AS day,COUNT(*) AS total FROM events WHERE created_at>=? GROUP BY day ORDER BY day',
                          ((datetime.now(timezone.utc)-timedelta(days=7)).isoformat(),)).fetchall()
    counts = {x['status']: x['total'] for x in rows}
    total = sum(counts.values())
    return {'total': total, 'delivered': counts.get('delivered', 0), 'failed': counts.get('failed', 0),
            'filtered': counts.get('filtered', 0), 'success_rate': round(100 * counts.get('delivered', 0) / total, 1) if total else 100,
            'active_routes': routes_count, 'daily': [dict(x) for x in days]}
