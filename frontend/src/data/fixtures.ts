import type { LedgerEvent, LedgerRoute } from '../core/types';
import { evaluate } from '../core/engine';

const day = (offset: number, minute: number) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset); d.setMinutes(minute);
  return d.toISOString();
};
export const demoRoutes: LedgerRoute[] = [
  { id: 'rt_leads', slug: 'lead-qualification', title: 'Lead qualification', source: 'Website forms', field: 'lead.score', operator: 'greater_than', expected: '65', delivery_mode: 'archive', enabled: true, created_at: day(13, 22) },
  { id: 'rt_payment', slug: 'payment-events', title: 'Payment lifecycle', source: 'Stripe (simulated)', field: 'type', operator: 'equals', expected: 'payment.succeeded', delivery_mode: 'archive', enabled: true, created_at: day(11, 47) },
  { id: 'rt_inventory', slug: 'inventory-updates', title: 'Inventory sync', source: 'Storefront API', field: 'quantity', operator: 'greater_than', expected: '5', delivery_mode: 'archive', enabled: true, created_at: day(8, 110) },
  { id: 'rt_support', slug: 'priority-tickets', title: 'Support escalation', source: 'Helpdesk', field: 'ticket.priority', operator: 'equals', expected: 'high', delivery_mode: 'sandbox_failure', enabled: true, created_at: day(4, 160) },
];

const dataFor = (i: number, id: string): Record<string, unknown> => {
  if (id === 'rt_leads') return { type: 'lead.created', lead: { score: i % 6 === 0 ? 41 : 73 + (i % 22), name: `Sample Lead ${i + 1}`, email: `lead${i + 1}@example.com`, source: ['landing-page', 'referral', 'campaign'][i % 3] }, environment: 'sandbox' };
  if (id === 'rt_payment') return { type: i % 6 === 0 ? 'payment.pending' : 'payment.succeeded', payment: { amount: 2900 + (i % 5) * 1000, currency: 'BRL', reference: `test_${String(i + 1).padStart(4, '0')}` }, environment: 'sandbox' };
  if (id === 'rt_inventory') return { type: 'inventory.updated', sku: `SKU-${4000 + i}`, quantity: i % 6 === 0 ? 2 : 8 + (i % 60), warehouse: 'south-01', environment: 'sandbox' };
  return { type: 'ticket.created', ticket: { priority: i % 4 === 0 ? 'normal' : 'high', number: `T-${400 + i}`, topic: 'billing' }, environment: 'sandbox' };
};

export const demoEvents: LedgerEvent[] = Array.from({ length: 112 }, (_, i) => {
  const route = demoRoutes[[0, 0, 0, 1, 0, 2, 1, 3, 2, 0][i % 10]];
  const payload = dataFor(i, route.id);
  const result = evaluate(route, payload);
  const ageIndex = [24, 43, 60, 75, 89, 101, 112].findIndex(limit => i < limit);
  const created = day(ageIndex, 450 - (i % 16) * 19);
  return {
    id: `evt_demo_${String(i + 1).padStart(5, '0')}`,
    route_id: route.id,
    route_title: route.title,
    route_slug: route.slug,
    event_type: String(payload.type),
    status: result.status,
    payload,
    dedupe_key: `sandbox_${100000 + i}`,
    attempt_count: i % 19 === 0 ? 2 : 1,
    latency_ms: 28 + (i * 17) % 245,
    trace: result.trace,
    created_at: created,
    updated_at: created,
  };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));
