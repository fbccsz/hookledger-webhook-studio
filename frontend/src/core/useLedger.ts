import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { demoEvents, demoRoutes } from '../data/fixtures';
import { asEvent, asRoute, calculateMetrics, evaluate, replayEvent } from './engine';
import type { Connection, Evaluation, LedgerEvent, LedgerRoute, Metrics, RouteDraft } from './types';

const LOCAL_KEY = 'hookledger:demo:v1';
const initial = () => {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { routes?: LedgerRoute[]; events?: LedgerEvent[] };
      if (Array.isArray(data.routes) && Array.isArray(data.events)) return { routes: data.routes, events: data.events };
    }
  } catch { /* browser storage can be unavailable */ }
  return { routes: demoRoutes, events: demoEvents };
};
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function useLedger() {
  const [data, setData] = useState(initial);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverMetrics, setServerMetrics] = useState<Metrics | null>(null);
  const mode = connection ? 'api' as const : 'demo' as const;
  useEffect(() => {
    if (connection) return;
    try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* no storage */ }
  }, [data, connection]);

  const reload = useCallback(async (conn?: Connection) => {
    const active = conn || connection;
    if (!active) return;
    setBusy(true);
    try {
      const [routes, events, metrics] = await Promise.all([api.routes(active), api.events(active), api.metrics(active)]);
      setData({ routes: routes.routes, events: events.events });
      setServerMetrics(metrics);
    } finally { setBusy(false); }
  }, [connection]);

  const connect = useCallback(async (url: string, token: string) => {
    const candidate = { url, token };
    setBusy(true);
    try {
      await api.health(candidate);
      const [routes, events, metrics] = await Promise.all([api.routes(candidate), api.events(candidate), api.metrics(candidate)]);
      setConnection(candidate);
      setData({ routes: routes.routes, events: events.events });
      setServerMetrics(metrics);
    } finally { setBusy(false); }
  }, []);

  const disconnect = useCallback(() => {
    setConnection(null);
    setServerMetrics(null);
    setData(initial());
  }, []);

  const resetDemo = useCallback(() => {
    setData({ routes: demoRoutes, events: demoEvents });
    window.localStorage.removeItem(LOCAL_KEY);
  }, []);

  const saveRoute = useCallback(async (draft: RouteDraft, id?: string) => {
    if (connection) {
      if (id) await api.updateRoute(connection, id, draft);
      else await api.createRoute(connection, draft);
      await reload();
      return;
    }
    const previous = data.routes.find(r => r.slug === draft.slug && r.id !== id);
    if (previous) throw new Error('This route slug is already in use');
    setData(current => ({
      ...current,
      routes: id ? current.routes.map(r => r.id === id ? { ...r, ...draft } : r) : [asRoute(draft, uid()), ...current.routes],
    }));
  }, [connection, reload, data.routes]);

  const simulate = useCallback(async (route: LedgerRoute, payload: Record<string, unknown>): Promise<Evaluation> => {
    return connection ? api.simulate(connection, route.id, payload) : evaluate(route, payload);
  }, [connection]);

  const dispatchDemo = useCallback((route: LedgerRoute, payload: Record<string, unknown>) => {
    if (connection) throw new Error('Live ingestion requires a signed request to /hooks/{slug}. Use the cURL example in Docs.');
    const event = asEvent(route, payload, 'evt_' + uid().slice(0, 16));
    setData(current => ({ ...current, events: [event, ...current.events].slice(0, 500) }));
    return event;
  }, [connection]);

  const replay = useCallback(async (event: LedgerEvent) => {
    if (connection) {
      await api.replay(connection, event.id);
      await reload();
      return;
    }
    const route = data.routes.find(r => r.id === event.route_id);
    if (!route || !route.enabled) throw new Error('Enable the route before replaying');
    if (event.attempt_count >= 10) throw new Error('Maximum replay attempts reached');
    const next = replayEvent(event, route);
    setData(current => ({ ...current, events: current.events.map(e => e.id === event.id ? next : e) }));
  }, [connection, data.routes, reload]);

  const metrics = useMemo(() => connection && serverMetrics ? serverMetrics : calculateMetrics(data.events, data.routes), [connection, serverMetrics, data.events, data.routes]);
  return { routes: data.routes, events: data.events, metrics, connection, mode, busy, connect, disconnect, reload, resetDemo, saveRoute, simulate, dispatchDemo, replay };
}
