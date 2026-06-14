import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REDIS, type GateRedis } from '../redis/redis.module';
import { saleKeys } from '../redis/keys';
import { SalesService } from '../sales/sales.service';
import { Outcome, type PurchaseResult } from '../domain/outcome';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(REDIS) private readonly redis: GateRedis,
    private readonly sales: SalesService,
  ) {}

  /**
   * Attempt a purchase. The sale-window check (upcoming/ended) is decided here from
   * cached config; stock + one-per-user are decided atomically inside the Gate.
   */
  async purchase(saleId: string, buyerId: string): Promise<PurchaseResult> {
    const sale = await this.sales.getSale(saleId);
    if (!sale) throw new NotFoundException(`unknown sale: ${saleId}`);

    const status = this.sales.statusOf(sale);
    if (status === 'UPCOMING') {
      return { outcome: Outcome.NOT_ACTIVE_UPCOMING, saleId, buyerId };
    }
    if (status === 'ENDED') {
      return { outcome: Outcome.NOT_ACTIVE_ENDED, saleId, buyerId };
    }

    const keys = saleKeys(saleId);
    const [code, ...rest] = await this.redis.rushGate(
      keys.stock,
      keys.buyers,
      keys.stream,
      buyerId,
      saleId,
    );

    switch (code) {
      case 'SUCCESS':
        return {
          outcome: Outcome.SUCCESS,
          saleId,
          buyerId,
          remaining: Number(rest[0]),
          reservationId: String(rest[1]),
        };
      case 'ALREADY_PURCHASED':
        return { outcome: Outcome.ALREADY_PURCHASED, saleId, buyerId };
      case 'SOLD_OUT':
        return { outcome: Outcome.SOLD_OUT, saleId, buyerId, remaining: 0 };
      case 'NOT_READY':
      default:
        return { outcome: Outcome.NOT_READY, saleId, buyerId };
    }
  }

  /** Has this buyer secured a reservation? Reads the Gate's buyer SET. */
  async hasPurchased(saleId: string, buyerId: string): Promise<boolean> {
    return (await this.redis.sismember(saleKeys(saleId).buyers, buyerId)) === 1;
  }
}
