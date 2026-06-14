import type { SaleStatus } from '../types/sale-status';

/** Human-readable label for each sale status — keeps the raw enum off the UI. */
export const STATUS_LABEL: Record<SaleStatus['status'], string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'On sale',
  ENDED: 'Ended',
  SOLD_OUT: 'Sold out',
};
