import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ZodPipe } from '../common/zod-pipe';
import { OUTCOME_STATUS } from '../domain/outcome-status';
import { purchaseBodySchema } from './purchase-body-schema';
import { PurchasesService } from './purchases.service';
import type { FastifyReply } from 'fastify';

@Controller('sales/:id/purchases')
export class PurchasesController {
  constructor(private readonly _purchases: PurchasesService) {}

  /**
   * Attempt to secure the item. No auth in this exercise → buyer identity is the
   * `userId` in the body (documented deviation, ADR-0003). Status mirrors the outcome.
   */
  @Post()
  async buy(
    @Param('id') saleId: string,
    @Body(new ZodPipe(purchaseBodySchema)) body: { userId: string },
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this._purchases.purchase(saleId, body.userId);
    res.status(OUTCOME_STATUS[result.outcome]);

    return result;
  }

  @Get(':userId')
  async check(@Param('id') saleId: string, @Param('userId') userId: string) {
    return { saleId, userId, purchased: await this._purchases.hasPurchased(saleId, userId) };
  }
}
