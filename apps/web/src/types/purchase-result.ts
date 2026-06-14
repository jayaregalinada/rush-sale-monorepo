import type { Outcome } from './outcome';

/** Body returned by `POST /sales/:id/purchases`. */
export interface PurchaseResult {
  outcome: Outcome;
  saleId: string;
  buyerId: string;
  remaining?: number;
  reservationId?: string;
}
