import type { PurchaseResult } from '../types/purchase-result';
import type { SaleStatus } from '../types/sale-status';

/**
 * The only place that talks to `fetch`. Feature code calls these typed methods instead of
 * issuing requests directly, so URL shape, headers and error handling live in one place.
 */
export class ApiClient {
  constructor(private readonly _baseUrl: string) {}

  getStatus(saleId: string): Promise<SaleStatus> {
    return this.get(`/sales/${saleId}/status`);
  }

  purchase(saleId: string, userId: string): Promise<PurchaseResult> {
    return this.post(`/sales/${saleId}/purchases`, { userId });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this._baseUrl}${path}`);

    if (!response.ok) {
      throw new Error(`GET ${path} → ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    // The `outcome` body is authoritative, so we read it regardless of HTTP status.
    return response.json() as Promise<T>;
  }
}
