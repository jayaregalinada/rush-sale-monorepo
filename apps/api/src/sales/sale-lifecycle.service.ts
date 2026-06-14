import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { REDIS, type GateRedis } from '../redis/redis.module';
import { SalesService } from './sales.service';

/**
 * Owns Gate state population: seeds an optional default sale from env, rehydrates all
 * sales on boot, and re-rehydrates whenever Redis reconnects (state may have been lost).
 */
@Injectable()
export class SaleLifecycle implements OnApplicationBootstrap {
  private readonly log = new Logger(SaleLifecycle.name);

  constructor(
    private readonly sales: SalesService,
    @Inject(REDIS) private readonly redis: GateRedis,
  ) {}

  async onApplicationBootstrap() {
    await this.seedFromEnv();
    await this.sales.rehydrateAll();

    // After a reconnect the AOF may have replayed (keys present → seed is a no-op) or the
    // instance may be fresh (keys absent → rehydrate from Ledger). seedOrRehydrate handles both.
    this.redis.on('ready', () => {
      this.log.warn('redis ready (reconnect) — rehydrating sales');
      void this.sales.rehydrateAll().catch((e) => this.log.error('rehydrate failed', e));
    });
  }

  private async seedFromEnv() {
    const env = loadEnv();
    if (!env.SEED_SALE_ID) return;
    if (
      !env.SEED_SALE_PRODUCT ||
      !env.SEED_SALE_STOCK ||
      !env.SEED_SALE_STARTS_AT ||
      !env.SEED_SALE_ENDS_AT
    ) {
      this.log.warn(`SEED_SALE_ID=${env.SEED_SALE_ID} set but seed fields incomplete — skipping`);
      return;
    }
    await this.sales.createSale({
      id: env.SEED_SALE_ID,
      product: env.SEED_SALE_PRODUCT,
      initialStock: env.SEED_SALE_STOCK,
      startsAt: env.SEED_SALE_STARTS_AT,
      endsAt: env.SEED_SALE_ENDS_AT,
    });
    this.log.log(`seeded default sale ${env.SEED_SALE_ID}`);
  }
}
