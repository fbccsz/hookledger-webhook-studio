"""SQLite storage with idempotency, per-event traces, and safe replay updates."""
from __future__ import annotations
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

SCHEMA = '''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  field TEXT NOT NULL,
  operator TEXT NOT NULL,
  expected TEXT NOT NULL DEFAULT '',
  delivery_mode TEXT NOT NULL DEFAULT 'archive',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  dedupe_key TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  trace TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(route_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_route_time ON events(route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
'''


def init_db(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=10) as connection:
        connection.executescript(SCHEMA)


@contextmanager
def connect(path: str) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    connection.execute('PRAGMA busy_timeout=5000')
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def route_dict(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    data['enabled'] = bool(data['enabled'])
    return data


def event_dict(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    data['payload'] = json.loads(data['payload'])
    data['trace'] = json.loads(data['trace'])
    return data
