import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          environment: 'node',
          testTimeout: 120_000, // Testcontainers pulls + boots real Redis/Postgres
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
