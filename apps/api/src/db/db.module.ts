import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadEnv } from '../config/load-env';
import { DB } from './db';
import { PG_POOL } from './pg-pool';
import { schema } from './schema';
import type { Database } from './database';

/**
 * Global DB module: one pg Pool, one Drizzle instance injectable as `DB`. Global so the
 * worker entrypoint and the API share the exact same providers.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: loadEnv().DATABASE_URL }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule {}
