import { Module } from '@nestjs/common';
import { SaleLifecycleService } from './sale-lifecycle.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleLifecycleService],
  exports: [SalesService],
})
export class SalesModule {}
