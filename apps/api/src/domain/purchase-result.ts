import type { Outcome } from './outcome';

/** The result of a purchase attempt, returned to the client and used internally. */
export interface PurchaseResult {
  outcome: Outcome;
  saleId: string;
  buyerId: string;
  remaining?: number;
  reservationId?: string;
}
