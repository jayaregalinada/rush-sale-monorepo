import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db';
import { saleTable } from '../db/sale-table';
import { reservationTable } from '../db/reservation-table';
import { Gate } from '../redis/gate';
import type { Database } from '../db/database';
import type { Sale } from '../db/sale';
import type { NewSale } from '../db/new-sale';
import type { SaleStatus } from './sale-status';

/** Reservations already recorded in the Ledger for a sale — the rehydration input. */
interface ReservationState {
  count: number;
  buyers: string[];
}

@Injectable()
export class SalesService {
  private readonly log = new Logger(SalesService.name);
  /** Sale config is small and rarely changes — cache it to keep the purchase path off Postgres. */
  private readonly cache = new Map<string, Sale>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly gate: Gate,
  ) {}

  /** Create a sale (idempotent on id), persist it, then seed its Gate state. */
  async createSale(input: NewSale): Promise<Sale> {
    await this.db.insert(saleTable).values(input).onConflictDoNothing();
    const sale = await this.loadFromDb(input.id);
    if (!sale) {
      throw new Error(`sale ${input.id} vanished after insert`);
    }
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
    if (now < sale.startsAt) {
      return 'UPCOMING';
    }
    if (now >= sale.endsAt) {
      return 'ENDED';
    }
    return 'ACTIVE';
  }

  /** Live remaining stock; null if the sale is not seeded yet. */
  remaining(saleId: string): Promise<number | null> {
    return this.gate.remaining(saleId);
  }

  /**
   * Populate the Gate's live state from the Ledger. Boot seed and post-crash rehydration
   * are the same path (ADR-0004). Guarded by an init lock so concurrent nodes don't race;
   * seeds only when state is ABSENT, so an intact AOF is never clobbered with the (lagging)
   * Ledger count.
   */
  async seedOrRehydrate(sale: Sale): Promise<void> {
    this.cache.set(sale.id, sale);

    if (!(await this.gate.acquireInitLock(sale.id))) {
      this.log.debug(`seed skipped for ${sale.id}: lock held by a peer`);
      return;
    }
    try {
      if (await this.gate.isSeeded(sale.id)) {
        this.log.debug(`seed skipped for ${sale.id}: already live (AOF)`);
        return;
      }

      const { count, buyers } = await this.loadReservationState(sale.id);
      const remaining = Math.max(0, sale.initialStock - count);
      await this.gate.seed(sale.id, remaining, buyers);

      this.log.log(
        `seeded ${sale.id}: remaining=${remaining} buyers=${buyers.length} (initial=${sale.initialStock})`,
      );
    } finally {
      await this.gate.releaseInitLock(sale.id);
    }
  }

  /** Seed every known sale — run on boot and on Redis reconnect. */
  async rehydrateAll(): Promise<void> {
    const all = await this.db.select().from(saleTable);
    for (const sale of all) {
      await this.seedOrRehydrate(sale);
    }
  }

  private async loadReservationState(saleId: string): Promise<ReservationState> {
    const rows = await this.db
      .select({ buyerId: reservationTable.buyerId })
      .from(reservationTable)
      .where(eq(reservationTable.saleId, saleId));
    return { count: rows.length, buyers: rows.map((r) => r.buyerId) };
  }

  private async loadFromDb(id: string): Promise<Sale | undefined> {
    const [row] = await this.db.select().from(saleTable).where(eq(saleTable.id, id)).limit(1);
    if (row) {
      this.cache.set(id, row);
    }
    return row;
  }
}
