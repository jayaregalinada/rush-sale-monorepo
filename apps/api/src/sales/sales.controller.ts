import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { SalesService } from './sales.service';
import { createSaleSchema } from './create-sale-schema';
import { ZodPipe } from '../common/zod-pipe';
import type { CreateSaleDto } from './create-sale-dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly _sales: SalesService) {}

  /** Admin: define a sale and seed its Gate. Idempotent on id. */
  @Post()
  async create(@Body(new ZodPipe(createSaleSchema)) dto: CreateSaleDto) {
    const sale = await this._sales.createSale(dto);

    return { id: sale.id, product: sale.product, initialStock: sale.initialStock };
  }

  @Get(':id/status')
  async status(@Param('id') id: string) {
    const sale = await this._sales.getSale(id);

    if (!sale) {
      throw new NotFoundException(`unknown sale: ${id}`);
    }

    return {
      saleId: sale.id,
      product: sale.product,
      status: this._sales.statusOf(sale),
      remaining: await this._sales.remaining(sale.id),
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
    };
  }
}
