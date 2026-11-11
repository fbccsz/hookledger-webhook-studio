import type { Connection, Evaluation, LedgerEvent, LedgerRoute, Metrics, RouteDraft } from '../core/types';

function base(connection: Connection): string {
  const url = connection.url.trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+/.test(url)) throw new Error('Provide a valid API URL');
  return url;
}
async function request<T>(connection: Connection, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(base(connection) + path, {
    method,
    headers: { 'Authorization': `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({})) as T & { detail?: string };
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : `Request failed (${response.status})`);
  return result;
}
export const api = {
  health: (connection: Connection) => request<{ status: string }>(connection, '/api/health'),
  routes: (connection: Connection) => request<{ routes: LedgerRoute[] }>(connection, '/api/routes'),
  events: (connection: Connection) => request<{ events: LedgerEvent[] }>(connection, '/api/events?limit=500'),
  metrics: (connection: Connection) => request<Metrics>(connection, '/api/metrics'),
  createRoute: (connection: Connection, route: RouteDraft) => request<{ route: LedgerRoute }>(connection, '/api/routes', 'POST', route),
  updateRoute: (connection: Connection, id: string, route: RouteDraft) => request<{ route: LedgerRoute }>(connection, '/api/routes/' + encodeURIComponent(id), 'PATCH', route),
  simulate: (connection: Connection, routeId: string, payload: Record<string, unknown>) => request<Evaluation>(connection, '/api/simulate', 'POST', { route_id: routeId, payload }),
  replay: (connection: Connection, id: string) => request<{ event: LedgerEvent }>(connection, '/api/events/' + encodeURIComponent(id) + '/replay', 'POST'),
};
