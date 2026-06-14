import http from 'k6/http';
import { Counter } from 'k6/metrics';

export const BASE = __ENV.BASE_URL || 'http://localhost:3000';
export const SALE_ID = __ENV.SALE_ID || 'launch-2026';

// Outcome tallies — the correctness proof reads these alongside the DB row count.
export const outcomes = {
  SUCCESS: new Counter('outcome_success'),
  ALREADY_PURCHASED: new Counter('outcome_already'),
  SOLD_OUT: new Counter('outcome_sold_out'),
  NOT_ACTIVE_UPCOMING: new Counter('outcome_upcoming'),
  NOT_ACTIVE_ENDED: new Counter('outcome_ended'),
  NOT_READY: new Counter('outcome_not_ready'),
};

export function buy(userId) {
  const res = http.post(`${BASE}/sales/${SALE_ID}/purchases`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
  });
  let outcome = 'NOT_READY';
  try {
    outcome = res.json('outcome') || outcome;
  } catch (_) {
    /* non-JSON (e.g. 500) — counts as not-ready */
  }
  if (outcomes[outcome]) outcomes[outcome].add(1);
  return { res, outcome };
}

export function status() {
  return http.get(`${BASE}/sales/${SALE_ID}/status`);
}
