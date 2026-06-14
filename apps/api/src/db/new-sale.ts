import type { saleTable } from './sale-table';

/** An insertable sale. */
export type NewSale = typeof saleTable.$inferInsert;
