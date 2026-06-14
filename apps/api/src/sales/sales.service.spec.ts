import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database';
import type { Sale } from '../db/sale';
import type { Gate } from '../redis/gate';
import { SalesService } from './sales.service';

const HOUR_MS = 3_600_000;
const now = Date.now();

/** A sale whose window straddles the real clock, so `statusOf()` with no arg reads ACTIVE. */
const activeSale = {
  id: 'launch-2026',
  product: 'Widget',
  initialStock: 100,
  startsAt: new Date(now - HOUR_MS),
  endsAt: new Date(now + HOUR_MS),
} as Sale;

const upcomingSale = { ...activeSale, startsAt: new Date(now + HOUR_MS) } as Sale;

/** Fake Drizzle: `select().from().where().limit()` resolves to the given rows. */
function fakeDb(rows: Sale[]): { db: Database; selectCalls: () => number } {
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  }));

  return { db: { select } as unknown as Database, selectCalls: () => select.mock.calls.length };
}

const noGate = {} as Gate;

describe('SalesService.statusOf', () => {
  const sale = {
    startsAt: new Date('2026-01-10T00:00:00Z'),
    endsAt: new Date('2026-01-20T00:00:00Z'),
  } as Sale;
  const service = new SalesService(fakeDb([]).db, noGate);

  it('is UPCOMING before the window opens', () => {
    expect(service.statusOf(sale, new Date('2026-01-05T00:00:00Z'))).toBe('UPCOMING');
  });

  it('is ACTIVE inside the window, inclusive of startsAt', () => {
    expect(service.statusOf(sale, new Date('2026-01-15T00:00:00Z'))).toBe('ACTIVE');
    expect(service.statusOf(sale, new Date('2026-01-10T00:00:00Z'))).toBe('ACTIVE');
  });

  it('is ENDED from endsAt onward (exclusive end)', () => {
    expect(service.statusOf(sale, new Date('2026-01-20T00:00:00Z'))).toBe('ENDED');
    expect(service.statusOf(sale, new Date('2026-01-25T00:00:00Z'))).toBe('ENDED');
  });
});

describe('SalesService.displayStatusOf', () => {
  const service = new SalesService(fakeDb([]).db, noGate);

  it('collapses ACTIVE to SOLD_OUT when live stock is exhausted', () => {
    expect(service.displayStatusOf(activeSale, 0)).toBe('SOLD_OUT');
  });

  it('stays ACTIVE while stock remains', () => {
    expect(service.displayStatusOf(activeSale, 5)).toBe('ACTIVE');
  });

  it('stays ACTIVE when unseeded (remaining null ≠ sold out)', () => {
    expect(service.displayStatusOf(activeSale, null)).toBe('ACTIVE');
  });

  it('never reports SOLD_OUT for a non-ACTIVE sale, even at zero stock', () => {
    expect(service.displayStatusOf(upcomingSale, 0)).toBe('UPCOMING');
  });
});

describe('SalesService.getSale caching', () => {
  it('caches a found sale and serves repeats without re-querying', async () => {
    const { db, selectCalls } = fakeDb([activeSale]);
    const service = new SalesService(db, noGate);

    expect(await service.getSale(activeSale.id)).toEqual(activeSale);
    expect(await service.getSale(activeSale.id)).toEqual(activeSale);
    expect(selectCalls()).toBe(1);
  });

  it('negative-caches an unknown id so a flood of repeats hits the DB only once', async () => {
    const { db, selectCalls } = fakeDb([]);
    const service = new SalesService(db, noGate);

    expect(await service.getSale('ghost')).toBeUndefined();
    expect(await service.getSale('ghost')).toBeUndefined();
    expect(selectCalls()).toBe(1);
  });
});
