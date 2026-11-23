import { PrismaClient } from '@prisma/client';
import { MAX_DATABASE_POOL_SIZE } from '../../../src/config/env.schema.js';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse_test?schema=public';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const TEST_DATABASE_NAME = /^[a-z][a-z0-9_]*_test$/;
const FORBIDDEN_DATABASE_NAME = /(?:^|[_-])(?:prod|production|staging)(?:[_-]|$)/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseDatabaseUrl(databaseUrl: string): URL {
  try {
    return new URL(databaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid absolute URL.');
  }
}

export function resolveTestDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  return source.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

export function testDatabaseName(databaseUrl: string): string {
  const url = parseDatabaseUrl(databaseUrl);

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error(`TEST_DATABASE_URL must use a PostgreSQL protocol: ${url.protocol}`);
  }

  const name = decodeURIComponent(url.pathname.slice(1));

  if (!TEST_DATABASE_NAME.test(name)) {
    throw new Error(
      `Refusing to use database "${name}": integration tests require a name matching ${TEST_DATABASE_NAME.source}`,
    );
  }

  return name;
}

export function assertSafeTestDatabaseUrl(
  databaseUrl: string,
  source: Record<string, string | undefined> = process.env,
): string {
  if (source.NODE_ENV === 'production') {
    throw new Error('Refusing to run integration tests with NODE_ENV=production');
  }

  const name = testDatabaseName(databaseUrl);

  if (FORBIDDEN_DATABASE_NAME.test(name)) {
    throw new Error(
      `Refusing to use database "${name}": the name looks like a production or staging database`,
    );
  }

  const url = parseDatabaseUrl(databaseUrl);

  if (!LOCAL_HOSTS.has(url.hostname) && source.ALLOW_REMOTE_TEST_DATABASE !== 'true') {
    throw new Error(
      `Refusing to use remote test database host "${url.hostname}"; set ALLOW_REMOTE_TEST_DATABASE=true explicitly for an isolated test server`,
    );
  }

  return name;
}

export function assertSafePoolSize(poolSize: number): void {
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > MAX_DATABASE_POOL_SIZE) {
    throw new Error(
      `Test pool size must be an integer between 1 and ${MAX_DATABASE_POOL_SIZE}; received ${poolSize}`,
    );
  }
}

export function createTestClient(
  databaseUrl: string = resolveTestDatabaseUrl(),
  poolSize = 5,
): PrismaClient {
  assertSafeTestDatabaseUrl(databaseUrl);
  assertSafePoolSize(poolSize);

  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', String(poolSize));

  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
}

export interface AdminDatabaseClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export function isDuplicateDatabaseFailure(error: unknown): boolean {
  const record = error as {
    code?: unknown;
    meta?: { code?: unknown; message?: unknown };
    message?: unknown;
  };
  const codes = [record.code, record.meta?.code];

  if (codes.includes('42P04')) {
    return true;
  }

  return [record.message, record.meta?.message].some(
    (message) => typeof message === 'string' && /42P04|already exists/i.test(message),
  );
}

export async function createDatabaseIfMissing(
  admin: AdminDatabaseClient,
  name: string,
): Promise<boolean> {
  if (!TEST_DATABASE_NAME.test(name)) {
    throw new Error(`Refusing to create database with an unsafe name: ${name}`);
  }

  const rows = await admin.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
    name,
  );

  if (rows[0]?.exists === true) {
    return false;
  }

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    return true;
  } catch (error) {
    // Two concurrent test runs can both observe a missing database; the loser
    // receives duplicate_database and must not fail the suite.
    if (isDuplicateDatabaseFailure(error)) {
      return false;
    }

    throw error;
  }
}

export async function ensureTestDatabase(databaseUrl: string): Promise<void> {
  const name = assertSafeTestDatabaseUrl(databaseUrl);
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.searchParams.delete('schema');

  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  });

  try {
    await createDatabaseIfMissing(admin, name);
  } finally {
    await admin.$disconnect();
  }
}
