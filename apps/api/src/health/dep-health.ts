import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DB } from '../db/db';
import { REDIS } from '../redis/redis';
import type { Database } from '../db/database';
import type { GateRedis } from '../redis/gate-redis';

/** Health indicators for the two backing stores. */
@Injectable()
export class DepHealth {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: GateRedis,
    private readonly hi: HealthIndicatorService,
  ) { }

  async redisPing() {
    const ind = this.hi.check('redis');
    try {
      await this.redis.ping();

      return ind.up();
    } catch (e) {
      return ind.down({ message: (e as Error).message });
    }
  }

  async dbPing() {
    const ind = this.hi.check('postgres');
    try {
      await this.db.execute(sql`select 1`);

      return ind.up();
    } catch (e) {
      return ind.down({ message: (e as Error).message });
    }
  }
}
