import type { SaleStatus } from './sale-status';

/** What the status endpoint reports: the lifecycle state plus the stock-derived SOLD_OUT. */
export type SaleDisplayStatus = SaleStatus | 'SOLD_OUT';
