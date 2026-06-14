import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';
import { WorkerService } from './worker.service';

/** Worker-only module: shared infra + the consumer, no HTTP controllers. */
@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    DbModule,
    RedisModule,
  ],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
