import { reservationTable } from './reservation-table';
import { saleTable } from './sale-table';

/** Drizzle schema object - enables relational queries and is the typing source for `Database`. */
export const schema = {
  sale: saleTable,
  reservation: reservationTable,
};
