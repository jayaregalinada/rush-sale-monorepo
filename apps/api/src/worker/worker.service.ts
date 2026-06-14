import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, type Database } from '../db/db.module';
import { reservations, sales } from '../db/schema';
import { REDIS, type GateRedis } from '../redis/redis.module';
import { saleKeys, STREAM_GROUP } from '../redis/keys';

const CONSUMER = `worker-${process.pid}`;
const BLOCK_MS = 2000;
const BATCH = 128;
const CLAIM_IDLE_MS = 30_000; // reclaim entries pending longer than this from a dead consumer
const REFRESH_MS = 5000; // how often to discover newly-created sales / streams

/**
 * Drains per-sale reservation Streams into the Ledger. At-least-once: the insert is
 * idempotent (UNIQUE natural key) and we XACK only after a successful write, so a
 * Postgres outage simply stalls acking while the Gate keeps selling (ADR-0001).
 */
@Injectable()
export class WorkerService {
  private readonly log = new Logger(WorkerService.name);
  private running = false;
  private streams = new Map<string, string>(); // streamKey -> saleId

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: GateRedis,
  ) {}

  async run(): Promise<void> {
    this.running = true;
    await this.refreshStreams();
    this.log.log(`worker ${CONSUMER} draining ${this.streams.size} stream(s)`);

    let lastRefresh = Date.now();
    while (this.running) {
      if (Date.now() - lastRefresh > REFRESH_MS) {
        await this.refreshStreams();
        lastRefresh = Date.now();
      }
      if (this.streams.size === 0) {
        await new Promise((r) => setTimeout(r, 1000)); // idle poll for the first sale
        continue;
      }
      try {
        await this.reclaimStale();
        await this.readBatch();
      } catch (err) {
        this.log.error('drain iteration failed; backing off', err as Error);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  stop() {
    this.running = false;
  }

  /** Discover sales, create the consumer group on each stream (idempotent). */
  private async refreshStreams() {
    const rows = await this.db.select({ id: sales.id }).from(sales);
    for (const { id } of rows) {
      const key = saleKeys(id).stream;
      if (this.streams.has(key)) continue;
      try {
        await this.redis.xgroup('CREATE', key, STREAM_GROUP, '0', 'MKSTREAM');
      } catch (e) {
        if (!(e as Error).message.includes('BUSYGROUP')) throw e;
      }
      this.streams.set(key, id);
    }
  }

  private async readBatch() {
    const keys = [...this.streams.keys()];
    const ids = keys.map(() => '>');
    const res = (await this.redis.xreadgroup(
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

    if (!res) return;
    for (const [streamKey, entries] of res) {
      await this.persist(streamKey, entries);
    }
  }

  /** Reclaim entries left pending by a crashed consumer so no reservation is stranded. */
  private async reclaimStale() {
    for (const streamKey of this.streams.keys()) {
      const [, entries] = (await this.redis.xautoclaim(
        streamKey,
        STREAM_GROUP,
        CONSUMER,
        CLAIM_IDLE_MS,
        '0',
        'COUNT',
        BATCH,
      )) as [string, [string, string[]][], string[]];
      if (entries?.length) await this.persist(streamKey, entries);
    }
  }

  private async persist(streamKey: string, entries: [string, string[]][]) {
    if (!entries?.length) return;
    for (const [streamId, fields] of entries) {
      const f = fieldsToObject(fields);
      const saleId = f.saleId;
      const buyerId = f.buyerId;
      if (!saleId || !buyerId) {
        this.log.warn(`malformed entry ${streamId} on ${streamKey} — acking to skip`);
        await this.redis.xack(streamKey, STREAM_GROUP, streamId);
        continue;
      }
      // Idempotent on (sale_id, buyer_id); the stream id is the row id for traceability.
      await this.db
        .insert(reservations)
        .values({ id: streamId, saleId, buyerId })
        .onConflictDoNothing();
      await this.redis.xack(streamKey, STREAM_GROUP, streamId);
    }
  }
}

function fieldsToObject(fields: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) o[fields[i]!] = fields[i + 1]!;
  return o;
}
