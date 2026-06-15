import { check, sleep } from 'k6';
import { buy } from '../lib/common.js';

/**
 * Scenario 4 — Redis fault injection (resilience + recovery).
 * Drive steady load, then kill Redis mid-run:
 *
 *   docker compose restart redis        # AOF replays → no oversell on recovery (warm)
 *   # or, to test cold rehydration:
 *   docker compose stop redis && rm -rf data/redis && docker compose up -d redis
 *
 * During the outage the API must fail cleanly (5xx / NOT_READY), never garbage. After
 * recovery it rehydrates and SUCCESS resumes.
 *
 * No-oversell invariant — two layers, because the *physical* invariant lives in the Ledger:
 *   - In-band (this file): `outcome_success <= SEED_SALE_STOCK`, the count of 201 responses.
 *     This holds tightly on the WARM path (AOF replays, ≤1s loss). On a COLD wipe it can
 *     legitimately tick a few over stock — in-flight reservations XADD'd but not yet drained
 *     when the volume was deleted were real 201s, now lost. That is data loss, not oversell.
 *   - Out-of-band (the real proof): `COUNT(reservations) <= initial_stock` with no duplicate
 *     (sale_id, buyer_id). The Ledger can never exceed stock on either path — see
 *     docs/load-testing.md → "The independent cross-check".
 */
const SEED_SALE_STOCK = Number(__ENV.SEED_SALE_STOCK || 1000);

// Outcomes that mean the API answered decisively (it did not corrupt or hang the request).
const DECISIVE_OUTCOMES = ['SUCCESS', 'SOLD_OUT', 'ALREADY_PURCHASED', 'NOT_READY'];
const SERVER_ERROR = 500;

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
    // Hard no-oversell guard on the WARM recovery path: 201s never exceed seeded stock.
    // (Cold-wipe oversell is impossible at the Ledger; proven by the SQL cross-check.)
    outcome_success: [{ threshold: `count<=${SEED_SALE_STOCK}`, abortOnFail: true }],
    // We tolerate request failures during the injected outage...
    http_req_failed: ['rate<0.40'],
    // ...but every response must be clean: a decisive outcome, or an honest failure. No
    // ambiguous/garbage responses, outage or not. This is the resilience signal.
    checks: ['rate>0.999'],
  },
};

export default function () {
  const { res, outcome } = buy(`fault-${__VU}-${__ITER}`);
  check(res, {
    'clean response: decisive outcome or honest failure': () =>
      res.status >= SERVER_ERROR || DECISIVE_OUTCOMES.includes(outcome),
  });
  sleep(0.1);
}
