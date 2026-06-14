/**
 * Canonical purchase outcomes. The body `outcome` discriminator is authoritative;
 * the HTTP status mirrors it for well-behaved HTTP clients (ADR-0003).
 */
export const Outcome = {
  SUCCESS: 'SUCCESS',
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  SOLD_OUT: 'SOLD_OUT',
  NOT_ACTIVE_UPCOMING: 'NOT_ACTIVE_UPCOMING',
  NOT_ACTIVE_ENDED: 'NOT_ACTIVE_ENDED',
  NOT_READY: 'NOT_READY',
} as const;

export type Outcome = (typeof Outcome)[keyof typeof Outcome];
