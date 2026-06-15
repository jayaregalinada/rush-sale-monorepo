import { Inject, Injectable } from '@nestjs/common';
import { GateCode } from './gate-code';
import type { GateRedis } from './gate-redis';
import type { GateResult } from './gate-result';
import { REDIS } from './redis';
import { saleKeys } from './sale-keys';

/** How long a seeding node holds the init lock before it auto-expires. */
const INIT_LOCK_TTL_SECONDS = 30;
const INIT_LOCK_TOKEN = '1';
const LOCK_ACQUIRED = 'OK';
const KEY_EXISTS = 1;

/**
 * Owns the Gate's live Redis state — the single concurrency-control surface. Every
 * read/write of stock, the buyer set, the reservation stream and the init lock goes
 * through here, so the rest of the app depends on this abstraction, not on ioredis.
 */
@Injectable()
export class Gate {
  constructor(@Inject(REDIS) private readonly _redis: GateRedis) {}

  /** Atomically attempt a reservation (the Lua Gate). */
  async reserve(saleId: string, buyerId: string): Promise<GateResult> {
    const keys = saleKeys(saleId);
    const [code, ...rest] = await this._redis.rushGate(
      keys.stock,
      keys.buyers,
      keys.stream,
      buyerId,
      saleId,
    );

    switch (code) {
      case GateCode.SUCCESS:
        return {
          code: GateCode.SUCCESS,
          remaining: Number(rest[0]),
          reservationId: String(rest[1]),
        };

      case GateCode.SOLD_OUT:
        return { code: GateCode.SOLD_OUT, remaining: 0 };

      case GateCode.ALREADY_PURCHASED:
        return { code: GateCode.ALREADY_PURCHASED, reservationId: String(rest[0]) };

      default:
        return { code: GateCode.NOT_READY };
    }
  }

  /** The buyer's reservation id, or null if they hold none. */
  async reservationOf(saleId: string, buyerId: string): Promise<string | null> {
    return this._redis.hget(saleKeys(saleId).buyers, buyerId);
  }

  /** Live remaining stock; null if the sale is not seeded yet. */
  async remaining(saleId: string): Promise<number | null> {
    const value = await this._redis.get(saleKeys(saleId).stock);

    return value === null ? null : Number(value);
  }

  /** True once the sale's live state is present (AOF live or freshly seeded). */
  async isSeeded(saleId: string): Promise<boolean> {
    return (await this._redis.exists(saleKeys(saleId).stock)) === KEY_EXISTS;
  }

  /** Acquire the per-sale seeding lock so concurrent nodes don't double-seed. */
  async acquireInitLock(saleId: string): Promise<boolean> {
    const result = await this._redis.set(
      saleKeys(saleId).initLock,
      INIT_LOCK_TOKEN,
      'EX',
      INIT_LOCK_TTL_SECONDS,
      'NX',
    );

    return result === LOCK_ACQUIRED;
  }

  async releaseInitLock(saleId: string): Promise<void> {
    await this._redis.del(saleKeys(saleId).initLock);
  }

  /**
   * Seed live state in one round trip: stock counter + the prior buyers, each mapped to
   * its reservation id (buyerId → reservationId) so rehydration restores the check lookup.
   */
  async seed(saleId: string, remaining: number, buyers: Record<string, string>): Promise<void> {
    const keys = saleKeys(saleId);
    const pipe = this._redis.pipeline();
    pipe.set(keys.stock, remaining);

    if (Object.keys(buyers).length > 0) {
      pipe.hset(keys.buyers, buyers);
    }

    await pipe.exec();
  }
}
