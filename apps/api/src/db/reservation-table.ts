import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { saleTable } from './sale-table';

/**
 * The Ledger - append-only record of Reservations, the system of record.
 * UNIQUE(sale_id, buyer_id) enforces One-Per-User AND makes the worker's
 * at-least-once Stream write exactly-once (ADR-0001).
 */
export const reservationTable = pgTable(
  'reservations',
  {
    id: text('id').primaryKey(), // Redis Stream entry id, e.g. "1718200000000-0"
    saleId: text('sale_id')
      .notNull()
      .references(() => saleTable.id),
    buyerId: text('buyer_id').notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('reservations_sale_buyer_uq').on(t.saleId, t.buyerId),
    index('reservations_sale_idx').on(t.saleId),
  ],
);
