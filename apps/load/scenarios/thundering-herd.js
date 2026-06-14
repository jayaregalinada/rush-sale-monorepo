import { check } from 'k6';
import { buy } from '../lib/common.js';

/**
 * Scenario 1 — Thundering herd.
 * A huge burst of unique buyers hits the Gate at once. Proves the hot path holds
 * up under spike load and that SUCCESS count never exceeds initial stock.
 * Correctness is confirmed out-of-band: COUNT(reservations) == initial_stock.
 */
export const options = {
  scenarios: {
    herd: {
      executor: 'ramping-arrival-rate',
      startRate: 200,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 3000,
      stages: [
        { target: 5000, duration: '10s' },
        { target: 5000, duration: '20s' },
        { target: 0, duration: '5s' },
      ],
    },
  },
  thresholds: {
    // Hard invariant: SUCCESS can never exceed initial stock. Abort the run if it does.
    outcome_success: [{ threshold: 'count<=1000', abortOnFail: true }],
    // Hot path stays fast and clean under the spike.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<150', 'p(99)<250', 'max<2000'],
    // Every iteration must reach a decisive, server-error-free outcome.
    checks: ['rate>0.99'],
  },
};

export default function () {
  const userId = `herd-${__VU}-${__ITER}`;
  const { res, outcome } = buy(userId);
  check(res, {
    'no server error': (r) => r.status < 500,
    'decisive outcome': () => ['SUCCESS', 'SOLD_OUT', 'ALREADY_PURCHASED'].includes(outcome),
  });
}
