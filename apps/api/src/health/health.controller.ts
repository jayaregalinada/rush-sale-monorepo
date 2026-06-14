import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DepHealth } from './dep-health';

@Controller()
export class HealthController {
  constructor(
    private readonly _health: HealthCheckService,
    private readonly _deps: DepHealth,
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
    return this._health.check([() => this._deps.redisPing(), () => this._deps.dbPing()]);
  }
}
