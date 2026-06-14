import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SaleLifecycleService } from './sale-lifecycle.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleLifecycleService],
  exports: [SalesService],
})
export class SalesModule {}
