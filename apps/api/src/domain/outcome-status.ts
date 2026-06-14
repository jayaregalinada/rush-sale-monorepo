import { HttpStatus } from '@nestjs/common';
import { Outcome } from './outcome';

/** Outcome → HTTP status (ADR-0003). */
export const OUTCOME_STATUS: Record<Outcome, HttpStatus> = {
  [Outcome.SUCCESS]: HttpStatus.CREATED, // 201
  [Outcome.ALREADY_PURCHASED]: HttpStatus.OK, // 200
  [Outcome.SOLD_OUT]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [Outcome.NOT_ACTIVE_UPCOMING]: HttpStatus.CONFLICT, // 409
  [Outcome.NOT_ACTIVE_ENDED]: HttpStatus.GONE, // 410
  [Outcome.NOT_READY]: HttpStatus.SERVICE_UNAVAILABLE, // 503
};
