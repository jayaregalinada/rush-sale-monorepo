import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { OUTCOME_STATUS } from '../domain/outcome';
import { PurchasesService } from './purchases.service';

const purchaseBody = z.object({ userId: z.string().min(1).max(128) });

@Controller('sales/:id/purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  /**
   * Attempt to secure the item. No auth in this exercise → buyer identity is the
   * `userId` in the body (documented deviation, ADR-0003). Status mirrors the outcome.
   */
  @Post()
  async buy(
    @Param('id') saleId: string,
    @Body(new ZodPipe(purchaseBody)) body: { userId: string },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.purchases.purchase(saleId, body.userId);
    res.status(OUTCOME_STATUS[result.outcome]);
    return result;
  }

  @Get(':userId')
  async check(@Param('id') saleId: string, @Param('userId') userId: string) {
    return { saleId, userId, purchased: await this.purchases.hasPurchased(saleId, userId) };
  }
}
