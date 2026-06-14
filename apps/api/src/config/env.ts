import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Best-effort: load a local .env (dev convenience). In containers no .env is present
// (it's gitignored, never copied), so env is injected and this is a no-op.
for (const dir of [process.cwd(), resolve(process.cwd(), '..', '..')]) {
  const file = resolve(dir, '.env');
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

/**
 * Single validated env schema shared by the API (main.ts) and the worker (worker.ts).
 * Fail fast on boot rather than discovering a missing var mid-sale.
 */
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DATABASE_URL: z.string(),

  // Optional boot-seed sale. If SEED_SALE_ID is set, it is created on startup if absent.
  SEED_SALE_ID: z.string().optional(),
  SEED_SALE_PRODUCT: z.string().optional(),
  SEED_SALE_STOCK: z.coerce.number().int().positive().optional(),
  SEED_SALE_STARTS_AT: z.coerce.date().optional(),
  SEED_SALE_ENDS_AT: z.coerce.date().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = z.prettifyError(parsed.error);
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
