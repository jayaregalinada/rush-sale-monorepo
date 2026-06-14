import { check, sleep } from 'k6';
import { buy, status } from '../lib/common.js';

/**
 * Scenario 3 — Sale window enforcement.
 * Steady traffic against a sale whose window you control. Reads the live status and
 * asserts the outcome matches: UPCOMING → NOT_ACTIVE_UPCOMING, ENDED → NOT_ACTIVE_ENDED,
 * ACTIVE → a real decision. Run against a sale configured to flip mid-test.
 */
export const options = {
  scenarios: {
    window: {
      executor: 'constant-vus',
      vus: 20,
      duration: '40s',
    },
  },
  thresholds: {
    // The outcome must always agree with the live sale window.
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<250'],
  },
};

export default function () {
  const phase = status().json('status');
  const { outcome } = buy(`window-${__VU}-${__ITER}`);

  check(null, {
    'outcome consistent with window': () => {
      if (phase === 'UPCOMING') return outcome === 'NOT_ACTIVE_UPCOMING';
      if (phase === 'ENDED') return outcome === 'NOT_ACTIVE_ENDED';
      // ACTIVE
      return ['SUCCESS', 'ALREADY_PURCHASED', 'SOLD_OUT', 'NOT_READY'].includes(outcome);
    },
  });
  sleep(0.5);
}
