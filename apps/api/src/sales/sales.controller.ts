import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ZodPipe } from '../common/zod-pipe';
import type { CreateSaleDto } from './create-sale-dto';
import { createSaleSchema } from './create-sale-schema';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly _sales: SalesService) {}

  /** Admin: define a sale and seed its Gate. Idempotent on id. */
  @Post()
  async create(@Body(new ZodPipe(createSaleSchema)) dto: CreateSaleDto) {
    const sale = await this._sales.createSale(dto);

    return {
      id: sale.id,
      product: sale.product,
      imageUrl: sale.imageUrl,
      initialStock: sale.initialStock,
    };
  }

  @Get(':id/status')
  async status(@Param('id') id: string) {
    const sale = await this._sales.getSale(id);

    if (!sale) {
      throw new NotFoundException(`unknown sale: ${id}`);
    }

    const remaining = await this._sales.remaining(sale.id);

    return {
      saleId: sale.id,
      product: sale.product,
      imageUrl: sale.imageUrl,
      status: this._sales.displayStatusOf(sale, remaining),
      initialStock: sale.initialStock,
      remaining,
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
    };
  }
}
