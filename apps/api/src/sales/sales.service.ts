import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { reservations, sales, type NewSale, type Sale } from '../db/schema';
import { REDIS, type GateRedis } from '../redis/redis.module';
import { saleKeys } from '../redis/keys';

export type SaleStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';

@Injectable()
export class SalesService {
  private readonly log = new Logger(SalesService.name);
  /** Sale config is small and rarely changes — cache it to keep the purchase path off Postgres. */
  private readonly cache = new Map<string, Sale>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: GateRedis,
  ) {}

  /** Create a sale (idempotent on id), persist it, then seed its Gate state. */
  async createSale(input: NewSale): Promise<Sale> {
    await this.db.insert(sales).values(input).onConflictDoNothing();
    const sale = await this.loadFromDb(input.id);
    if (!sale) throw new Error(`sale ${input.id} vanished after insert`);
    await this.seedOrRehydrate(sale);
    return sale;
  }

  getCached(id: string): Sale | undefined {
    return this.cache.get(id);
  }

  async getSale(id: string): Promise<Sale | undefined> {
    return this.cache.get(id) ?? (await this.loadFromDb(id));
  }

  statusOf(sale: Sale, now = new Date()): SaleStatus {
    if (now < sale.startsAt) return 'UPCOMING';
    if (now >= sale.endsAt) return 'ENDED';
    return 'ACTIVE';
  }

  /** Live remaining stock straight from the Gate; null if not seeded yet. */
  async remaining(saleId: string): Promise<number | null> {
    const v = await this.redis.get(saleKeys(saleId).stock);
    return v === null ? null : Number(v);
  }

  /**
   * Populate the Gate's live state from the Ledger. Boot seed and post-crash
   * rehydration are the same path (ADR-0004). Guarded by SET NX so concurrent API
   * nodes don't race; only seeds keys that are ABSENT, so an intact AOF is never
   * clobbered with the (lagging) Ledger count.
   */
  async seedOrRehydrate(sale: Sale): Promise<void> {
    this.cache.set(sale.id, sale);
    const keys = saleKeys(sale.id);

    const locked = await this.redis.set(keys.initLock, '1', 'EX', 30, 'NX');
    if (locked !== 'OK') {
      this.log.debug(`seed skipped for ${sale.id}: lock held by a peer`);
      return;
    }
    try {
      if ((await this.redis.exists(keys.stock)) === 1) {
        this.log.debug(`seed skipped for ${sale.id}: stock key present (AOF live)`);
        return;
      }

      const countRows = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(reservations)
        .where(eq(reservations.saleId, sale.id));
      const count = countRows[0]?.count ?? 0;
      const buyers = await this.db
        .select({ buyerId: reservations.buyerId })
        .from(reservations)
        .where(eq(reservations.saleId, sale.id));

      const remaining = Math.max(0, sale.initialStock - count);
      const pipe = this.redis.pipeline();
      pipe.set(keys.stock, remaining);
      if (buyers.length > 0) pipe.sadd(keys.buyers, ...buyers.map((b) => b.buyerId));
      await pipe.exec();

      this.log.log(
        `seeded ${sale.id}: remaining=${remaining} buyers=${buyers.length} (initial=${sale.initialStock})`,
      );
    } finally {
      await this.redis.del(keys.initLock);
    }
  }

  /** Seed every known sale — run on boot and on Redis reconnect. */
  async rehydrateAll(): Promise<void> {
    const all = await this.db.select().from(sales);
    for (const sale of all) await this.seedOrRehydrate(sale);
  }

  private async loadFromDb(id: string): Promise<Sale | undefined> {
    const [row] = await this.db.select().from(sales).where(eq(sales.id, id)).limit(1);
    if (row) this.cache.set(id, row);
    return row;
  }
}
