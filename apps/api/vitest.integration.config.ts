import dotenv from 'dotenv';
import { configDefaults, defineConfig } from 'vitest/config';
import {
  assertSafeTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from './test/integration/helpers/database.js';

dotenv.config({
  path: new URL('../../.env', import.meta.url),
  quiet: true,
});

const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertSafeTestDatabaseUrl(databaseUrl, process.env);
const redisUrl = process.env.TEST_REDIS_URL;

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      DATABASE_POOL_SIZE: '5',
      ...(redisUrl === undefined ? {} : { REDIS_URL: redisUrl }),
    },
    include: ['test/integration/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/dist/**', '**/coverage/**'],
    fileParallelism: false,
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
