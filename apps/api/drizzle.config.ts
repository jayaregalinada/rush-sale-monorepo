import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/config/env';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: loadEnv().DATABASE_URL },
});
