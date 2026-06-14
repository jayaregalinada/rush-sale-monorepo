import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { schema } from './schema';

/** The injectable Drizzle database, typed with the full schema. */
export type Database = NodePgDatabase<typeof schema>;
