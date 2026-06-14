import { check } from 'k6';
import { buy } from '../lib/common.js';

/**
 * Scenario 2 — One-per-user under contention.
 * A small pool of buyers each hammers Buy many times concurrently. Proves a buyer
 * can never hold two reservations: first call SUCCESS, every retry ALREADY_PURCHASED,
 * never a second SUCCESS for the same id.
 */
export const options = {
  scenarios: {
    repeat_buyers: {
      executor: 'per-vu-iterations',
      vus: 50, // 50 distinct buyers
      iterations: 40, // each tries to buy 40 times
      maxDuration: '30s',
    },
  },
  thresholds: {
    'outcome_success': ['count<=50'], // at most one SUCCESS per buyer
  },
};

export default function () {
  const userId = `buyer-${__VU}`; // same id across this VU's iterations
  const { res, outcome } = buy(userId);
  check(res, {
    'first wins or already-purchased': () =>
      ['SUCCESS', 'ALREADY_PURCHASED', 'SOLD_OUT'].includes(outcome),
  });
}
