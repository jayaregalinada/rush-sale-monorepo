import type { Outcome } from '../types/outcome';

/** Buyer-facing copy for each purchase outcome. */
export const OUTCOME_MESSAGES: Record<Outcome, string> = {
  SUCCESS: '🎉 Secured! The item is yours.',
  ALREADY_PURCHASED: 'You already secured one — only one per buyer.',
  SOLD_OUT: 'Sold out. Better luck next drop.',
  NOT_ACTIVE_UPCOMING: 'Not started yet. Hang tight.',
  NOT_ACTIVE_ENDED: 'This sale has ended.',
  NOT_READY: 'Warming up — try again in a moment.',
};
