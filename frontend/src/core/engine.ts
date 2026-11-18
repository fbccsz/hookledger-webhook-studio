import type { EventStatus, Evaluation, LedgerEvent, LedgerRoute, Metrics, RouteDraft, TraceStep } from './types';

export function getPath(payload: Record<string, unknown>, path: string): [boolean, unknown] {
  if (!path || path.length > 96 || path.split('.').length > 6) return [false, undefined];
  let current: unknown = payload;
  for (const segment of path.split('.')) {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment) || !current || typeof current !== 'object' || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return [false, undefined];
    current = (current as Record<string, unknown>)[segment];
  }
  return [true, current];
}

function parseFiniteDecimal(value: unknown): number | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text)) return null;
    value = text;
  } else if (typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function evaluate(route: LedgerRoute | RouteDraft, payload: Record<string, unknown>): Evaluation {
  const [found, actual] = getPath(payload, route.field);
  let matched = false;
  if (route.operator === 'exists') matched = found && actual != null;
  else if (found) {
    if (route.operator === 'equals') matched = String(actual).toLowerCase() === route.expected.toLowerCase();
    if (route.operator === 'contains') matched = String(actual).toLowerCase().includes(route.expected.toLowerCase());
    if (route.operator === 'greater_than') {
      const actualNumber = parseFiniteDecimal(actual);
      const expectedNumber = parseFiniteDecimal(route.expected);
      matched = actualNumber !== null && expectedNumber !== null && actualNumber > expectedNumber;
    }
  }
  const status: EventStatus = !matched ? 'filtered' : route.delivery_mode === 'sandbox_failure' ? 'failed' : 'delivered';
  const trace: TraceStep[] = [
    { step: 'payload', result: 'ok', detail: 'JSON object validated' },
    { step: 'condition', result: matched ? 'matched' : 'skipped', detail: `${route.field} ${route.operator} ${route.expected}`.trim() },
    { step: 'route', result: matched ? 'matched' : 'filtered', detail: matched ? 'Continue to destination' : 'Event did not match rule' },
    { step: 'delivery', result: status === 'delivered' ? 'ok' : status === 'failed' ? 'failed' : 'skipped', detail: status === 'failed' ? 'Intentional sandbox failure' : status === 'delivered' ? 'Archived locally — no outbound request made' : 'Rule did not match' },
  ];
  return { status, trace, persisted: false };
}

export function calculateMetrics(events: LedgerEvent[], routes: LedgerRoute[]): Metrics {
  const delivered = events.filter(e => e.status === 'delivered').length;
  const failed = events.filter(e => e.status === 'failed').length;
  const filtered = events.filter(e => e.status === 'filtered').length;
  const daily: Metrics['daily'] = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const dt = new Date(); dt.setDate(dt.getDate() - daysAgo);
    const day = dt.toISOString().slice(0, 10);
    daily.push({ day, total: events.filter(e => e.created_at.slice(0, 10) === day).length });
  }
  return { total: events.length, delivered, failed, filtered, success_rate: events.length ? +(100 * delivered / events.length).toFixed(1) : 100, active_routes: routes.filter(r => r.enabled).length, daily };
}

export function asRoute(draft: RouteDraft, id: string): LedgerRoute {
  return { ...draft, id, created_at: new Date().toISOString() };
}

export function asEvent(route: LedgerRoute, payload: Record<string, unknown>, id: string, idempotencyKey: string | null = null): LedgerEvent {
  const { status, trace } = evaluate(route, payload);
  const time = new Date().toISOString();
  return { id, route_id: route.id, route_title: route.title, route_slug: route.slug, event_type: typeof payload.type === 'string' ? payload.type.slice(0, 80) : 'event.received', status, payload, dedupe_key: idempotencyKey, attempt_count: 1, latency_ms: 12 + Math.floor(Math.random() * 30), trace, created_at: time, updated_at: time };
}

export function replayEvent(event: LedgerEvent, route: LedgerRoute): LedgerEvent {
  const { status, trace } = evaluate(route, event.payload);
  return { ...event, status, trace: [{ step: 'replay', result: 'ok', detail: `Attempt ${event.attempt_count + 1}` }, ...trace], attempt_count: event.attempt_count + 1, updated_at: new Date().toISOString() };
}

export function samplePayload(route: LedgerRoute): Record<string, unknown> {
  if (route.id.includes('payment')) return { type: 'payment.succeeded', payment: { amount: 12900, currency: 'BRL', reference: 'test_tx_9012' }, environment: 'sandbox' };
  if (route.id.includes('inventory')) return { type: 'inventory.updated', sku: 'HD-4482', quantity: 18, warehouse: 'south-1', environment: 'sandbox' };
  if (route.id.includes('support')) return { type: 'ticket.created', ticket: { priority: 'high', category: 'billing', ref: 'T-9014' }, environment: 'sandbox' };
  return { type: 'lead.created', lead: { score: 84, source: 'website', segment: 'b2b', email: 'demo@example.com' }, environment: 'sandbox' };
}
