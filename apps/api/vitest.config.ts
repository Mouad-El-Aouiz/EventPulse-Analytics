import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // Unit tests never connect to PostgreSQL. Point them at a dedicated,
      // non-existent database so an accidental connection cannot reach the
      // development database.
      DATABASE_URL:
        'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse_unit_test?schema=public',
      DATABASE_POOL_SIZE: '1',
    },
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/dist/**', '**/coverage/**', '**/test/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**'],
    },
  },
});
