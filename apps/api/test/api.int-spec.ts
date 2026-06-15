import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/db/pg-pool';
import { REDIS } from '../src/redis/redis';

/**
 * End-to-end through the REAL stack: HTTP → Nest controllers → Gate (real Redis) →
 * config in real Postgres. Proves the API contract (status codes, validation, the
 * outcome→HTTP mirroring of ADR-0003) AND that the concurrency control holds at the
 * HTTP edge, not just at the Lua layer (which gate.int-spec covers directly).
 */
const HOUR_MS = 3_600_000;
const SALE_ID = 'e2e-sale';
const RUSH_SALE_ID = 'e2e-rush';
const RUSH_STOCK = 10;
const RUSH_BUYERS = 200;

/** The schema the app expects - mirrors the Drizzle table defs (test bootstrap, no drizzle-kit). */
const SCHEMA_DDL = `
  CREATE TABLE sales (
    id text PRIMARY KEY,
    product text NOT NULL,
    image_url text,
    initial_stock integer NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE reservations (
    id text PRIMARY KEY,
    sale_id text NOT NULL REFERENCES sales(id),
    buyer_id text NOT NULL,
    reserved_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservations_sale_buyer_uq UNIQUE (sale_id, buyer_id)
  );
  CREATE INDEX reservations_sale_idx ON reservations(sale_id);
`;

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let app: NestFastifyApplication;

function activeWindow() {
  return {
    startsAt: new Date(Date.now() - HOUR_MS).toISOString(),
    endsAt: new Date(Date.now() + HOUR_MS).toISOString(),
  };
}

const post = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, payload, headers: { 'content-type': 'application/json' } });
const get = (url: string) => app.inject({ method: 'GET', url });

beforeAll(async () => {
  [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  // Point the app at the containers, and make sure no boot-seed sale leaks in from a dev .env.
  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = redis.getConnectionUrl();
  delete process.env.SEED_SALE_ID;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(SCHEMA_DDL);
  await pool.end();

  // Import AFTER env is set so the lazy loadEnv() in the module factories reads the containers.
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  await post('/sales', { id: SALE_ID, product: 'Widget', initialStock: 5, ...activeWindow() });
}, 180_000);

afterAll(async () => {
  // The pg Pool and ioredis client are useFactory providers Nest won't auto-dispose; close
  // them before stopping the containers, or in-flight connections get terminated (57P01).
  if (app) {
    const pool = app.get<Pool>(PG_POOL);
    const client = app.get<{ quit: () => Promise<unknown> }>(REDIS);
    await app.close();
    await client.quit().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
  await Promise.all([pg?.stop(), redis?.stop()]);
});

describe('POST /sales', () => {
  it('creates a sale (201) and echoes its config', async () => {
    const res = await post('/sales', {
      id: 'another-sale',
      product: 'Gadget',
      initialStock: 3,
      ...activeWindow(),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'another-sale', product: 'Gadget', initialStock: 3 });
  });

  it('rejects an invalid body with 400', async () => {
    const res = await post('/sales', { id: 'bad', product: 'X', initialStock: -1, ...activeWindow() });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /sales/:id/status', () => {
  it('reports an ACTIVE sale with live remaining', async () => {
    const res = await get(`/sales/${SALE_ID}/status`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ saleId: SALE_ID, status: 'ACTIVE', remaining: 5 });
  });

  it('404s for an unknown sale', async () => {
    expect((await get('/sales/nope/status')).statusCode).toBe(404);
  });
});

describe('POST /sales/:id/purchases', () => {
  it('sells, rejects a repeat, and exposes the reservation via the check endpoint', async () => {
    const first = await post(`/sales/${SALE_ID}/purchases`, { userId: 'alice' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ outcome: 'SUCCESS', remaining: 4 });
    const reservationId = first.json().reservationId;
    expect(reservationId).toBeTruthy();

    const repeat = await post(`/sales/${SALE_ID}/purchases`, { userId: 'alice' });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).toMatchObject({ outcome: 'ALREADY_PURCHASED', reservationId });

    const check = await get(`/sales/${SALE_ID}/purchases/alice`);
    expect(check.json()).toMatchObject({ purchased: true, reservationId });
  });

  it('reports a buyer who never purchased as not-purchased', async () => {
    expect((await get(`/sales/${SALE_ID}/purchases/ghost`)).json()).toMatchObject({
      purchased: false,
      reservationId: null,
    });
  });

  it('400s when userId is missing', async () => {
    expect((await post(`/sales/${SALE_ID}/purchases`, {})).statusCode).toBe(400);
  });

  it('404s a purchase against an unknown sale', async () => {
    expect((await post('/sales/nope/purchases', { userId: 'x' })).statusCode).toBe(404);
  });
});

describe('concurrency at the HTTP edge', () => {
  it(`never oversells: ${RUSH_BUYERS} buyers vs ${RUSH_STOCK} stock yields exactly ${RUSH_STOCK} SUCCESS`, async () => {
    await post('/sales', {
      id: RUSH_SALE_ID,
      product: 'LimitedDrop',
      initialStock: RUSH_STOCK,
      ...activeWindow(),
    });

    const replies = await Promise.all(
      Array.from({ length: RUSH_BUYERS }, (_, i) =>
        post(`/sales/${RUSH_SALE_ID}/purchases`, { userId: `buyer-${i}` }),
      ),
    );
    const outcomes = replies.map((r) => r.json().outcome);

    expect(outcomes.filter((o) => o === 'SUCCESS')).toHaveLength(RUSH_STOCK);
    expect(outcomes.filter((o) => o === 'SOLD_OUT')).toHaveLength(RUSH_BUYERS - RUSH_STOCK);

    const status = await get(`/sales/${RUSH_SALE_ID}/status`);
    expect(status.json()).toMatchObject({ status: 'SOLD_OUT', remaining: 0 });
  });
});
