import { Injectable, NotFoundException } from '@nestjs/common';
import { Outcome } from '../domain/outcome';
import type { PurchaseResult } from '../domain/purchase-result';
import { Gate } from '../redis/gate';
import { GateCode } from '../redis/gate-code';
import type { GateResult } from '../redis/gate-result';
import type { SaleStatus } from '../sales/sale-status';
import { SalesService } from '../sales/sales.service';

/** A sale that isn't ACTIVE short-circuits before the Gate, with a window-specific outcome. */
const NOT_ACTIVE_OUTCOME: Partial<Record<SaleStatus, Outcome>> = {
  UPCOMING: Outcome.NOT_ACTIVE_UPCOMING,
  ENDED: Outcome.NOT_ACTIVE_ENDED,
};

/** Gate result code → client-facing purchase outcome (1:1). */
const GATE_OUTCOME: Record<GateCode, Outcome> = {
  [GateCode.SUCCESS]: Outcome.SUCCESS,
  [GateCode.ALREADY_PURCHASED]: Outcome.ALREADY_PURCHASED,
  [GateCode.SOLD_OUT]: Outcome.SOLD_OUT,
  [GateCode.NOT_READY]: Outcome.NOT_READY,
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly _gate: Gate,
    private readonly _sales: SalesService,
  ) {}

  /**
   * Attempt a purchase. The sale-window check (upcoming/ended) is decided here from
   * cached config; stock + one-per-user are decided atomically inside the Gate.
   */
  async purchase(saleId: string, buyerId: string): Promise<PurchaseResult> {
    const sale = await this._sales.getSale(saleId);

    if (!sale) {
      throw new NotFoundException(`unknown sale: ${saleId}`);
    }

    const windowOutcome = NOT_ACTIVE_OUTCOME[this._sales.statusOf(sale)];

    if (windowOutcome) {
      return { outcome: windowOutcome, saleId, buyerId };
    }

    const result = await this._gate.reserve(saleId, buyerId);

    return this._toPurchaseResult(saleId, buyerId, result);
  }

  /** The buyer's reservation id if they secured one, else null. */
  async reservationFor(saleId: string, buyerId: string): Promise<string | null> {
    return this._gate.reservationOf(saleId, buyerId);
  }

  private _toPurchaseResult(saleId: string, buyerId: string, result: GateResult): PurchaseResult {
    return {
      outcome: GATE_OUTCOME[result.code],
      saleId,
      buyerId,
      remaining: result.remaining,
      reservationId: result.reservationId,
    };
  }
}
