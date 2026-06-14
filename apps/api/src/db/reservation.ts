import type { reservationTable } from './reservation-table';

/** A persisted reservation (Ledger) row. */
export type Reservation = typeof reservationTable.$inferSelect;
