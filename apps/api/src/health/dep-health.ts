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
    @Inject(DB) private readonly _db: Database,
    @Inject(REDIS) private readonly _redis: GateRedis,
    private readonly _healthIndicator: HealthIndicatorService,
  ) {}

  async redisPing() {
    const indicator = this._healthIndicator.check('redis');

    try {
      await this._redis.ping();

      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }

  async dbPing() {
    const indicator = this._healthIndicator.check('postgres');

    try {
      await this._db.execute(sql`select 1`);

      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
