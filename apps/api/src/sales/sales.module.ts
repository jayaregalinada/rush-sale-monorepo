import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SaleLifecycle } from './sale-lifecycle.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleLifecycle],
  exports: [SalesService],
})
export class SalesModule {}
