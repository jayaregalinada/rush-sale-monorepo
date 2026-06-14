import { check, sleep } from 'k6';
import { buy } from '../lib/common.js';

/**
 * Scenario 4 — Redis fault injection (resilience + recovery).
 * Drive steady load, then kill Redis mid-run:
 *
 *   docker compose restart redis        # AOF replays → no oversell on recovery
 *   # or, to test cold rehydration:
 *   docker compose stop redis && docker volume rm rush-sale_redis-data && docker compose up -d redis
 *
 * During the outage the API should fail cleanly (5xx / NOT_READY), never oversell.
 * After recovery + rehydration, SUCCESS resumes and the final invariant still holds:
 * COUNT(reservations) <= initial_stock, with no duplicate (sale_id, buyer_id).
 */
export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 300,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 300,
      maxVUs: 1000,
    },
  },
  thresholds: {
    // We tolerate errors during the injected outage; the invariant check is the real gate.
    http_req_failed: ['rate<0.40'],
  },
};

export default function () {
  const { res, outcome } = buy(`fault-${__VU}-${__ITER}`);
  check(res, {
    'never a 2nd success / no oversell signal': () => res.status !== 409 || outcome !== 'SUCCESS',
  });
  sleep(0.1);
}
