import { saleTable } from './sale-table';
import { reservationTable } from './reservation-table';

/** Drizzle schema object — enables relational queries and is the typing source for `Database`. */
export const schema = {
  sale: saleTable,
  reservation: reservationTable,
};
