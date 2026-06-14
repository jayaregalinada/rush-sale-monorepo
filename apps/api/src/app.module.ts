import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from './db/db.module';
import { RedisModule } from './redis/redis.module';
import { SalesModule } from './sales/sales.module';
import { PurchasesModule } from './purchases/purchases.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { autoLogging: false, level: process.env.LOG_LEVEL ?? 'info' },
    }),
    DbModule,
    RedisModule,
    SalesModule,
    PurchasesModule,
    HealthModule,
  ],
})
export class AppModule {}
