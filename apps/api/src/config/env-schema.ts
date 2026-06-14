import { z } from 'zod';

/** Validated shape of the process environment, shared by the API and the worker. */
export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DATABASE_URL: z.string(),

  // Optional boot-seed sale. If SEED_SALE_ID is set, it is created on startup if absent.
  SEED_SALE_ID: z.string().optional(),
  SEED_SALE_PRODUCT: z.string().optional(),
  SEED_SALE_IMAGE: z.string().optional(),
  SEED_SALE_STOCK: z.coerce.number().int().positive().optional(),
  SEED_SALE_STARTS_AT: z.coerce.date().optional(),
  SEED_SALE_ENDS_AT: z.coerce.date().optional(),
});
