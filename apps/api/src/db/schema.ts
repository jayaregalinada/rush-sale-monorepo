import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/** Sale configuration — the durable definition of a Flash Sale (ADR-0004). */
export const sales = pgTable('sales', {
  id: text('id').primaryKey(),
  product: text('product').notNull(),
  initialStock: integer('initial_stock').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * The Ledger — append-only record of Reservations, the system of record.
 * UNIQUE(sale_id, buyer_id) enforces One-Per-User AND makes the worker's
 * at-least-once Stream write exactly-once (ADR-0001).
 */
export const reservations = pgTable(
  'reservations',
  {
    id: text('id').primaryKey(), // Redis Stream entry id, e.g. "1718200000000-0"
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    buyerId: text('buyer_id').notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique('reservations_sale_buyer_uq').on(t.saleId, t.buyerId),
    index('reservations_sale_idx').on(t.saleId),
  ],
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
