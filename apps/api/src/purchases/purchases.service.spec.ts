import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Sale } from '../db/sale';
import { Outcome } from '../domain/outcome';
import type { Gate } from '../redis/gate';
import { GateCode } from '../redis/gate-code';
import type { GateResult } from '../redis/gate-result';
import type { SaleStatus } from '../sales/sale-status';
import type { SalesService } from '../sales/sales.service';
import { PurchasesService } from './purchases.service';

const SALE_ID = 'launch-2026';
const BUYER = 'alice';
const sale = { id: SALE_ID } as Sale;

/** Stub the only two SalesService methods the purchase path touches. */
function fakeSales(status: SaleStatus, found: Sale | undefined = sale): SalesService {
  return {
    getSale: vi.fn().mockResolvedValue(found),
    statusOf: vi.fn().mockReturnValue(status),
  } as unknown as SalesService;
}

/** A SalesService that finds no sale for the given id. */
function noSaleFound(): SalesService {
  return {
    getSale: vi.fn().mockResolvedValue(undefined),
    statusOf: vi.fn(),
  } as unknown as SalesService;
}

function fakeGate(result?: GateResult): Gate {
  return {
    reserve: vi.fn().mockResolvedValue(result),
    reservationOf: vi.fn(),
  } as unknown as Gate;
}

describe('PurchasesService', () => {
  it('404s on an unknown sale without touching the Gate', async () => {
    const gate = fakeGate();
    const service = new PurchasesService(gate, noSaleFound());

    await expect(service.purchase(SALE_ID, BUYER)).rejects.toBeInstanceOf(NotFoundException);
    expect(gate.reserve).not.toHaveBeenCalled();
  });

  it('short-circuits an UPCOMING sale before the Gate', async () => {
    const gate = fakeGate();
    const service = new PurchasesService(gate, fakeSales('UPCOMING'));

    const result = await service.purchase(SALE_ID, BUYER);

    expect(result.outcome).toBe(Outcome.NOT_ACTIVE_UPCOMING);
    expect(gate.reserve).not.toHaveBeenCalled();
  });

  it('short-circuits an ENDED sale before the Gate', async () => {
    const gate = fakeGate();
    const service = new PurchasesService(gate, fakeSales('ENDED'));

    const result = await service.purchase(SALE_ID, BUYER);

    expect(result.outcome).toBe(Outcome.NOT_ACTIVE_ENDED);
    expect(gate.reserve).not.toHaveBeenCalled();
  });

  it('maps a winning Gate reservation to SUCCESS, carrying remaining + reservationId', async () => {
    const gate = fakeGate({ code: GateCode.SUCCESS, remaining: 99, reservationId: '1-0' });
    const service = new PurchasesService(gate, fakeSales('ACTIVE'));

    const result = await service.purchase(SALE_ID, BUYER);

    expect(result).toMatchObject({
      outcome: Outcome.SUCCESS,
      saleId: SALE_ID,
      buyerId: BUYER,
      remaining: 99,
      reservationId: '1-0',
    });
  });

  it('maps a repeat buyer to ALREADY_PURCHASED with the original reservationId', async () => {
    const gate = fakeGate({ code: GateCode.ALREADY_PURCHASED, reservationId: '1-0' });
    const service = new PurchasesService(gate, fakeSales('ACTIVE'));

    const result = await service.purchase(SALE_ID, BUYER);

    expect(result.outcome).toBe(Outcome.ALREADY_PURCHASED);
    expect(result.reservationId).toBe('1-0');
  });

  it('maps an exhausted Gate to SOLD_OUT', async () => {
    const gate = fakeGate({ code: GateCode.SOLD_OUT, remaining: 0 });
    const service = new PurchasesService(gate, fakeSales('ACTIVE'));

    expect((await service.purchase(SALE_ID, BUYER)).outcome).toBe(Outcome.SOLD_OUT);
  });

  it('maps an unseeded Gate to NOT_READY', async () => {
    const gate = fakeGate({ code: GateCode.NOT_READY });
    const service = new PurchasesService(gate, fakeSales('ACTIVE'));

    expect((await service.purchase(SALE_ID, BUYER)).outcome).toBe(Outcome.NOT_READY);
  });

  it('delegates the reservation check to the Gate', async () => {
    const gate = fakeGate();
    (gate.reservationOf as ReturnType<typeof vi.fn>).mockResolvedValue('1-0');
    const service = new PurchasesService(gate, fakeSales('ACTIVE'));

    expect(await service.reservationFor(SALE_ID, BUYER)).toBe('1-0');
    expect(gate.reservationOf).toHaveBeenCalledWith(SALE_ID, BUYER);
  });
});
