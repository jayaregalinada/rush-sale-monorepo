/** Sale status as returned by `GET /sales/:id/status`. */
export interface SaleStatus {
  saleId: string;
  product: string;
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED';
  initialStock: number;
  remaining: number | null;
  startsAt: string;
  endsAt: string;
}
