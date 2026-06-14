import type { saleTable } from './sale-table';

/** A persisted sale row. */
export type Sale = typeof saleTable.$inferSelect;
