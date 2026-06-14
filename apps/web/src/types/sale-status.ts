/** Sale status as returned by `GET /sales/:id/status`. */
export interface SaleStatus {
  saleId: string;
  product: string;
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'SOLD_OUT';
  initialStock: number;
  remaining: number | null;
  startsAt: string;
  endsAt: string;
}
