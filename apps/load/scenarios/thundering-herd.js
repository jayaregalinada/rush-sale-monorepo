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
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<250'],
  },
};

export default function () {
  const userId = `herd-${__VU}-${__ITER}`;
  const { res, outcome } = buy(userId);
  check(res, {
    'no server error': (r) => r.status < 500,
    'decisive outcome': () =>
      ['SUCCESS', 'SOLD_OUT', 'ALREADY_PURCHASED'].includes(outcome),
  });
}
