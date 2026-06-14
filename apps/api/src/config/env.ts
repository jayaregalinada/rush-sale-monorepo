import type { z } from 'zod';
import type { envSchema } from './env-schema';

/** The validated environment. */
export type Env = z.infer<typeof envSchema>;
