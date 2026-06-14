import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { REDIS, type GateRedis } from '../redis/redis.module';

@Injectable()
class DepHealth {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: GateRedis,
    private readonly hi: HealthIndicatorService,
  ) {}

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

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly deps: DepHealth,
  ) {}

  /** Liveness — process is up. */
  @Get('health')
  live() {
    return { status: 'ok' };
  }

  /** Readiness — Redis (hot path) and Postgres (durability) both reachable. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.deps.redisPing(), () => this.deps.dbPing()]);
  }
}

export { DepHealth };
