import { describe, expect, it } from 'vitest';
import { asEvent, calculateMetrics, evaluate, getPath, replayEvent } from './engine';
import { demoRoutes } from '../data/fixtures';

describe('pure webhook rule engine', () => {
  const route = demoRoutes[0];
  it('traverses nested JSON fields safely', () => {
    expect(getPath({ lead: { score: 89 } }, 'lead.score')).toEqual([true, 89]);
    expect(getPath({ lead: { score: 89 } }, 'lead.profile.name')).toEqual([false, undefined]);
    expect(getPath({ lead: { score: 89 } }, 'lead.__proto__.name')).toEqual([false, undefined]);
  });
  it('archives valid payloads matching the condition', () => {
    const result = evaluate(route, { lead: { score: 85 } });
    expect(result.status).toBe('delivered');
    expect(result.trace).toHaveLength(4);
    expect(result.persisted).toBe(false);
  });
  it('filters payloads that fail the condition', () => {
    expect(evaluate(route, { lead: { score: 35 } }).status).toBe('filtered');
  });
  it('handles missing values and invalid numeric comparisons', () => {
    expect(evaluate(route, { lead: { score: 'unknown' } }).status).toBe('filtered');
    expect(evaluate(route, { order: {} }).status).toBe('filtered');
  });
  it('evaluates equality and contains without case sensitivity', () => {
    expect(evaluate({ ...route, field: 'type', operator: 'equals', expected: 'LEAD.CREATED' }, { type: 'lead.created' }).status).toBe('delivered');
    expect(evaluate({ ...route, field: 'type', operator: 'contains', expected: 'CREAT' }, { type: 'lead.created' }).status).toBe('delivered');
  });
  it('checks presence with exists', () => {
    expect(evaluate({ ...route, field: 'user.email', operator: 'exists' }, { user: { email: 'demo@example.com' } }).status).toBe('delivered');
    expect(evaluate({ ...route, field: 'user.email', operator: 'exists' }, { user: { email: null } }).status).toBe('filtered');
  });
  it('creates traceable sandbox failures', () => {
    expect(evaluate({ ...route, delivery_mode: 'sandbox_failure' }, { lead: { score: 85 } }).status).toBe('failed');
  });
  it('replays a failed event against the updated route', () => {
    const failedRoute = { ...route, delivery_mode: 'sandbox_failure' as const };
    const event = asEvent(failedRoute, { lead: { score: 85 } }, 'evt_test');
    const replayed = replayEvent(event, route);
    expect(event.status).toBe('failed');
    expect(replayed.status).toBe('delivered');
    expect(replayed.attempt_count).toBe(2);
    expect(replayed.trace[0].step).toBe('replay');
  });
  it('computes accurate aggregate metrics', () => {
    const good = asEvent(route, { lead: { score: 85 } }, 'evt_1');
    const bad = asEvent(route, { lead: { score: 21 } }, 'evt_2');
    const metrics = calculateMetrics([good, bad], [route]);
    expect(metrics.total).toBe(2);
    expect(metrics.delivered).toBe(1);
    expect(metrics.filtered).toBe(1);
    expect(metrics.success_rate).toBe(50);
    expect(metrics.active_routes).toBe(1);
    expect(metrics.daily).toHaveLength(7);
  });
});
