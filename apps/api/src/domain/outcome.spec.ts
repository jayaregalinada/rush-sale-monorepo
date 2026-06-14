import { describe, expect, it } from 'vitest';
import { Outcome } from './outcome';
import { OUTCOME_STATUS } from './outcome-status';

describe('outcome → HTTP status', () => {
  it('maps every outcome to a status', () => {
    for (const o of Object.values(Outcome)) {
      expect(OUTCOME_STATUS[o]).toBeTypeOf('number');
    }
  });

  it('uses the agreed semantics (ADR-0003)', () => {
    expect(OUTCOME_STATUS[Outcome.SUCCESS]).toBe(201);
    expect(OUTCOME_STATUS[Outcome.ALREADY_PURCHASED]).toBe(200);
    expect(OUTCOME_STATUS[Outcome.SOLD_OUT]).toBe(422);
    expect(OUTCOME_STATUS[Outcome.NOT_ACTIVE_UPCOMING]).toBe(409);
    expect(OUTCOME_STATUS[Outcome.NOT_ACTIVE_ENDED]).toBe(410);
    expect(OUTCOME_STATUS[Outcome.NOT_READY]).toBe(503);
  });
});
