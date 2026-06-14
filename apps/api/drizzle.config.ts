import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/config/load-env';

export default defineConfig({
  schema: './src/db/*-table.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: loadEnv().DATABASE_URL },
});
