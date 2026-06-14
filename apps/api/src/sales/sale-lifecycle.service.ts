import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { loadEnv } from '../config/load-env';
import type { GateRedis } from '../redis/gate-redis';
import { REDIS } from '../redis/redis';
import { SalesService } from './sales.service';

/**
 * Owns Gate state population: seeds an optional default sale from env, rehydrates all
 * sales on boot, and re-rehydrates whenever Redis reconnects (state may have been lost).
 */
@Injectable()
export class SaleLifecycleService implements OnApplicationBootstrap {
  private readonly _log = new Logger(SaleLifecycleService.name);

  constructor(
    private readonly _sales: SalesService,
    @Inject(REDIS) private readonly _redis: GateRedis,
  ) {}

  async onApplicationBootstrap() {
    await this._seedFromEnv();
    await this._sales.rehydrateAll();

    // After a reconnect the AOF may have replayed (keys present → seed is a no-op) or the
    // instance may be fresh (keys absent → rehydrate from Ledger). seedOrRehydrate handles both.
    this._redis.on('ready', () => {
      this._log.warn('redis ready (reconnect) — rehydrating sales');
      void this._sales.rehydrateAll().catch((error) => this._log.error('rehydrate failed', error));
    });
  }

  private async _seedFromEnv() {
    const env = loadEnv();

    if (!env.SEED_SALE_ID) {
      return;
    }

    if (
      !env.SEED_SALE_PRODUCT ||
      !env.SEED_SALE_STOCK ||
      !env.SEED_SALE_STARTS_AT ||
      !env.SEED_SALE_ENDS_AT
    ) {
      this._log.warn(`SEED_SALE_ID=${env.SEED_SALE_ID} set but seed fields incomplete — skipping`);

      return;
    }

    await this._sales.createSale({
      id: env.SEED_SALE_ID,
      product: env.SEED_SALE_PRODUCT,
      imageUrl: env.SEED_SALE_IMAGE,
      initialStock: env.SEED_SALE_STOCK,
      startsAt: env.SEED_SALE_STARTS_AT,
      endsAt: env.SEED_SALE_ENDS_AT,
    });

    this._log.log(`seeded default sale ${env.SEED_SALE_ID}`);
  }
}
