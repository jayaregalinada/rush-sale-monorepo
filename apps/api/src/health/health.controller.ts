import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DepHealth } from './dep-health';

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
