import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/database';
import { DB } from '../db/db';
import type { NewSale } from '../db/new-sale';
import { reservationTable } from '../db/reservation-table';
import type { Sale } from '../db/sale';
import { saleTable } from '../db/sale-table';
import { Gate } from '../redis/gate';
import type { SaleDisplayStatus } from './sale-display-status';
import type { SaleStatus } from './sale-status';

/** Reservations already recorded in the Ledger for a sale — the rehydration input. */
interface ReservationState {
  count: number;
  /** buyerId → reservationId, as the Gate's buyers hash expects. */
  buyers: Record<string, string>;
}

@Injectable()
export class SalesService {
  private readonly _log = new Logger(SalesService.name);
  /** Sale config is small and rarely changes — cache it to keep the purchase path off Postgres. */
  private readonly _cache = new Map<string, Sale>();

  constructor(
    @Inject(DB) private readonly _db: Database,
    private readonly _gate: Gate,
  ) {}

  /** Create a sale (idempotent on id), persist it, then seed its Gate state. */
  async createSale(input: NewSale): Promise<Sale> {
    await this._db.insert(saleTable).values(input).onConflictDoNothing();
    const sale = await this._loadFromDb(input.id);

    if (!sale) {
      throw new Error(`sale ${input.id} vanished after insert`);
    }

    await this.seedOrRehydrate(sale);

    return sale;
  }

  getCached(id: string): Sale | undefined {
    return this._cache.get(id);
  }

  async getSale(id: string): Promise<Sale | undefined> {
    return this._cache.get(id) ?? (await this._loadFromDb(id));
  }

  statusOf(sale: Sale, now = new Date()): SaleStatus {
    if (now < sale.startsAt) {
      return 'UPCOMING';
    }

    if (now >= sale.endsAt) {
      return 'ENDED';
    }

    return 'ACTIVE';
  }

  /**
   * Status as the storefront should see it: the lifecycle state, except ACTIVE collapses
   * to SOLD_OUT once live stock is exhausted. `remaining` is the live Gate value passed in
   * by the caller (null = unseeded), so this stays sync and adds no extra Redis round trip.
   */
  displayStatusOf(sale: Sale, remaining: number | null): SaleDisplayStatus {
    const lifecycle = this.statusOf(sale);

    if (lifecycle === 'ACTIVE' && remaining !== null && remaining <= 0) {
      return 'SOLD_OUT';
    }

    return lifecycle;
  }

  /** Live remaining stock; null if the sale is not seeded yet. */
  remaining(saleId: string): Promise<number | null> {
    return this._gate.remaining(saleId);
  }

  /**
   * Populate the Gate's live state from the Ledger. Boot seed and post-crash rehydration
   * are the same path (ADR-0004). Guarded by an init lock so concurrent nodes don't race;
   * seeds only when state is ABSENT, so an intact AOF is never clobbered with the (lagging)
   * Ledger count.
   */
  async seedOrRehydrate(sale: Sale): Promise<void> {
    this._cache.set(sale.id, sale);

    if (!(await this._gate.acquireInitLock(sale.id))) {
      this._log.debug(`seed skipped for ${sale.id}: lock held by a peer`);

      return;
    }

    try {
      await this._seedUnderLock(sale);
    } finally {
      await this._gate.releaseInitLock(sale.id);
    }
  }

  /**
   * Seed the Gate from the Ledger — runs while the init lock is held. Skips when live state
   * already exists so an intact AOF is never clobbered with the (lagging) Ledger count.
   */
  private async _seedUnderLock(sale: Sale): Promise<void> {
    if (await this._gate.isSeeded(sale.id)) {
      this._log.debug(`seed skipped for ${sale.id}: already live (AOF)`);

      return;
    }

    const { count, buyers } = await this._loadReservationState(sale.id);
    const remaining = Math.max(0, sale.initialStock - count);
    await this._gate.seed(sale.id, remaining, buyers);

    this._log.log(
      `seeded ${sale.id}: remaining=${remaining} buyers=${count} (initial=${sale.initialStock})`,
    );
  }

  /** Seed every known sale — run on boot and on Redis reconnect. */
  async rehydrateAll(): Promise<void> {
    const all = await this._db.select().from(saleTable);

    for (const sale of all) {
      await this.seedOrRehydrate(sale);
    }
  }

  private async _loadReservationState(saleId: string): Promise<ReservationState> {
    const rows = await this._db
      .select({ id: reservationTable.id, buyerId: reservationTable.buyerId })
      .from(reservationTable)
      .where(eq(reservationTable.saleId, saleId));

    const buyers: Record<string, string> = {};

    for (const row of rows) {
      buyers[row.buyerId] = row.id;
    }

    return { count: rows.length, buyers };
  }

  private async _loadFromDb(id: string): Promise<Sale | undefined> {
    const [row] = await this._db.select().from(saleTable).where(eq(saleTable.id, id)).limit(1);

    if (row) {
      this._cache.set(id, row);
    }

    return row;
  }
}
