export type EventStatus = 'delivered' | 'failed' | 'filtered';
export type Operator = 'equals' | 'contains' | 'greater_than' | 'exists';
export type DeliveryMode = 'archive' | 'sandbox_failure';
export type Page = 'overview' | 'events' | 'routes' | 'playground' | 'settings' | 'docs';

export interface LedgerRoute {
  id: string;
  slug: string;
  title: string;
  source: string;
  field: string;
  operator: Operator;
  expected: string;
  delivery_mode: DeliveryMode;
  enabled: boolean;
  created_at: string;
}
export type RouteDraft = Omit<LedgerRoute, 'id' | 'created_at'>;
export interface TraceStep { step: string; result: string; detail: string }
export interface LedgerEvent {
  id: string;
  route_id: string;
  route_title: string;
  route_slug: string;
  event_type: string;
  status: EventStatus;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  attempt_count: number;
  latency_ms: number;
  trace: TraceStep[];
  created_at: string;
  updated_at: string;
}
export interface Evaluation { status: EventStatus; trace: TraceStep[]; persisted: boolean }
export interface Metrics {
  total: number;
  delivered: number;
  failed: number;
  filtered: number;
  success_rate: number;
  active_routes: number;
  daily: { day: string; total: number }[];
}
export interface Connection { url: string; token: string }
export type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
