import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Sale configuration — the durable definition of a Flash Sale (ADR-0004). */
export const saleTable = pgTable('sales', {
  id: text('id').primaryKey(),
  product: text('product').notNull(),
  // Optional product image URL.
  imageUrl: text('image_url'),
  initialStock: integer('initial_stock').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});
