const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface SaleStatus {
  saleId: string;
  product: string;
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED';
  remaining: number | null;
  startsAt: string;
  endsAt: string;
}

export type Outcome =
  | 'SUCCESS'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE_UPCOMING'
  | 'NOT_ACTIVE_ENDED'
  | 'NOT_READY';

export interface PurchaseResult {
  outcome: Outcome;
  saleId: string;
  buyerId: string;
  remaining?: number;
  reservationId?: string;
}

export async function getStatus(saleId: string): Promise<SaleStatus> {
  const r = await fetch(`${BASE}/sales/${saleId}/status`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

/** The body `outcome` is authoritative; we read it regardless of HTTP status. */
export async function purchase(saleId: string, userId: string): Promise<PurchaseResult> {
  const r = await fetch(`${BASE}/sales/${saleId}/purchases`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return r.json();
}
