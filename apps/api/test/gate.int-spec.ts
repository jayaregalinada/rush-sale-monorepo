import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GATE_LUA } from '../src/redis/gate-lua';
import { GateCode } from '../src/redis/gate-code';
import { saleKeys } from '../src/redis/sale-keys';
import type { GateRedis } from '../src/redis/gate-redis';

/**
 * The correctness centerpiece: the Gate against a REAL Redis. In-memory fakes can't run
 * the Lua EVAL the proof depends on (ADR-0005). We hammer it concurrently and assert the
 * invariants hold: no oversell, one-per-user, exactly-once.
 */
const GATE_KEY_COUNT = 3;
const SALE = 'test-sale';
const keys = saleKeys(SALE);

let container: StartedRedisContainer;
let redis: GateRedis;

beforeAll(async () => {
  container = await new RedisContainer('redis:7-alpine').start();
  redis = new Redis(container.getConnectionUrl()) as GateRedis;
  redis.defineCommand('rushGate', { numberOfKeys: GATE_KEY_COUNT, lua: GATE_LUA });
});

afterAll(async () => {
  await redis?.quit();
  await container?.stop();
});

beforeEach(async () => {
  await redis.flushall();
});

const buy = (buyerId: string) =>
  redis.rushGate(keys.stock, keys.buyers, keys.stream, buyerId, SALE);

describe('Gate', () => {
  it('returns NOT_READY before the sale is seeded', async () => {
    const [code] = await buy('alice');
    expect(code).toBe(GateCode.NOT_READY);
  });

  it('never oversells under concurrency', async () => {
    const STOCK = 100;
    const BUYERS = 1000;
    await redis.set(keys.stock, STOCK);

    const results = await Promise.all(
      Array.from({ length: BUYERS }, (_, index) => buy(`buyer-${index}`)),
    );
    const codes = results.map((result) => result[0]);

    expect(codes.filter((code) => code === GateCode.SUCCESS)).toHaveLength(STOCK);
    expect(codes.filter((code) => code === GateCode.SOLD_OUT)).toHaveLength(BUYERS - STOCK);
    expect(Number(await redis.get(keys.stock))).toBe(0);
    // One stream entry per real reservation — the worker's input is exactly the winners.
    expect(await redis.xlen(keys.stream)).toBe(STOCK);
  });

  it('enforces one-per-user even under a concurrent retry storm', async () => {
    await redis.set(keys.stock, 50);

    const results = await Promise.all(
      Array.from({ length: 200 }, () => buy('repeat-buyer')),
    );
    const codes = results.map((result) => result[0]);

    expect(codes.filter((code) => code === GateCode.SUCCESS)).toHaveLength(1);
    expect(codes.filter((code) => code === GateCode.ALREADY_PURCHASED)).toHaveLength(199);
    expect(Number(await redis.get(keys.stock))).toBe(49); // only one unit consumed
    expect(await redis.sismember(keys.buyers, 'repeat-buyer')).toBe(1);
  });

  it('reports SOLD_OUT (not NOT_READY) when stock is exhausted', async () => {
    await redis.set(keys.stock, 1);
    expect((await buy('first'))[0]).toBe(GateCode.SUCCESS);
    expect((await buy('second'))[0]).toBe(GateCode.SOLD_OUT);
  });
});
