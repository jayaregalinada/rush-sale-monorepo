import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { envSchema } from './env-schema';
import type { Env } from './env';

// Best-effort: load a local .env (dev convenience). In containers no .env is present
// (it's gitignored, never copied), so env is injected and this is a no-op.
for (const dir of [process.cwd(), resolve(process.cwd(), '..', '..')]) {
  const file = resolve(dir, '.env');

  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

/** Parse + validate the environment, failing fast on boot if anything is missing. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}
