import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB } from '../db/db';
import { saleTable } from '../db/sale-table';
import { reservationTable } from '../db/reservation-table';
import { REDIS } from '../redis/redis';
import { saleKeys } from '../redis/sale-keys';
import { STREAM_GROUP } from '../redis/stream-group';
import type { Database } from '../db/database';
import type { GateRedis } from '../redis/gate-redis';

const CONSUMER = `worker-${process.pid}`;
const BLOCK_MS = 2000;
const BATCH = 128;
const CLAIM_IDLE_MS = 30_000; // reclaim entries pending longer than this from a dead consumer
const REFRESH_MS = 5000; // how often to discover newly-created sales / streams
const IDLE_POLL_MS = 1000; // poll cadence while no streams exist yet
const BACKOFF_MS = 1000; // pause after a failed drain iteration

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

/**
 * Drains per-sale reservation Streams into the Ledger. At-least-once: the insert is
 * idempotent (UNIQUE natural key) and we XACK only after a successful write, so a
 * Postgres outage simply stalls acking while the Gate keeps selling (ADR-0001).
 */
@Injectable()
export class WorkerService {
  private readonly _log = new Logger(WorkerService.name);
  private _running = false;
  private _streams = new Map<string, string>(); // streamKey -> saleId

  constructor(
    @Inject(DB) private readonly _db: Database,
    @Inject(REDIS) private readonly _redis: GateRedis,
  ) {}

  async run(): Promise<void> {
    this._running = true;
    await this._refreshStreams();
    this._log.log(`worker ${CONSUMER} draining ${this._streams.size} stream(s)`);

    let lastRefresh = Date.now();

    while (this._running) {
      if (Date.now() - lastRefresh > REFRESH_MS) {
        await this._refreshStreams();
        lastRefresh = Date.now();
      }

      if (this._streams.size === 0) {
        await sleep(IDLE_POLL_MS); // wait for the first sale to be created
        continue;
      }

      try {
        await this._reclaimStale();
        await this._readBatch();
      } catch (error) {
        this._log.error('drain iteration failed; backing off', error as Error);
        await sleep(BACKOFF_MS);
      }
    }
  }

  stop() {
    this._running = false;
  }

  /** Discover sales, create the consumer group on each stream (idempotent). */
  private async _refreshStreams() {
    const rows = await this._db.select({ id: saleTable.id }).from(saleTable);

    for (const { id } of rows) {
      const key = saleKeys(id).stream;

      if (this._streams.has(key)) {
        continue;
      }

      try {
        await this._redis.xgroup('CREATE', key, STREAM_GROUP, '0', 'MKSTREAM');
      } catch (error) {
        if (!(error as Error).message.includes('BUSYGROUP')) {
          throw error;
        }
      }

      this._streams.set(key, id);
    }
  }

  private async _readBatch() {
    const keys = [...this._streams.keys()];
    const ids = keys.map(() => '>');
    const replies = (await this._redis.xreadgroup(
      'GROUP',
      STREAM_GROUP,
      CONSUMER,
      'COUNT',
      BATCH,
      'BLOCK',
      BLOCK_MS,
      'STREAMS',
      ...keys,
      ...ids,
    )) as [string, [string, string[]][]][] | null;

    if (!replies) {
      return;
    }

    for (const [streamKey, entries] of replies) {
      await this._persist(streamKey, entries);
    }
  }

  /** Reclaim entries left pending by a crashed consumer so no reservation is stranded. */
  private async _reclaimStale() {
    for (const streamKey of this._streams.keys()) {
      const [, entries] = (await this._redis.xautoclaim(
        streamKey,
        STREAM_GROUP,
        CONSUMER,
        CLAIM_IDLE_MS,
        '0',
        'COUNT',
        BATCH,
      )) as [string, [string, string[]][], string[]];

      if (entries?.length) {
        await this._persist(streamKey, entries);
      }
    }
  }

  private async _persist(streamKey: string, entries: [string, string[]][]) {
    if (!entries?.length) {
      return;
    }

    for (const [streamId, fields] of entries) {
      const parsed = parseEntryFields(fields);
      const saleId = parsed.saleId;
      const buyerId = parsed.buyerId;

      if (!saleId || !buyerId) {
        this._log.warn(`malformed entry ${streamId} on ${streamKey} — acking to skip`);
        await this._redis.xack(streamKey, STREAM_GROUP, streamId);
        continue;
      }

      // Idempotent on (sale_id, buyer_id); the stream id is the row id for traceability.
      await this._db
        .insert(reservationTable)
        .values({ id: streamId, saleId, buyerId })
        .onConflictDoNothing();
      await this._redis.xack(streamKey, STREAM_GROUP, streamId);
    }
  }
}

/** Redis returns stream fields as a flat [name, value, ...] array; pair them into an object. */
function parseEntryFields(fields: string[]): Record<string, string> {
  const record: Record<string, string> = {};

  for (let index = 0; index + 1 < fields.length; index += 2) {
    record[fields[index]!] = fields[index + 1]!;
  }

  return record;
}
