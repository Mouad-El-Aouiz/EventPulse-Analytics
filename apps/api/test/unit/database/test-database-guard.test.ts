import { describe, expect, it } from 'vitest';
import {
  assertSafePoolSize,
  assertSafeTestDatabaseUrl,
  createDatabaseIfMissing,
  createTestClient,
  DEFAULT_TEST_DATABASE_URL,
  isDuplicateDatabaseFailure,
  resolveTestDatabaseUrl,
  testDatabaseName,
  type AdminDatabaseClient,
} from '../../integration/helpers/database.js';

function adminStub(exists: boolean, execute: () => Promise<number>): AdminDatabaseClient {
  return {
    $queryRawUnsafe: async () => [{ exists }],
    $executeRawUnsafe: execute,
  } as unknown as AdminDatabaseClient;
}

function duplicateDatabaseError(): Error {
  return Object.assign(new Error('ERROR: database "eventpulse_test" already exists'), {
    code: '42P04',
  });
}

describe('integration test database guard', () => {
  it('accepts the default isolated test database', () => {
    expect(testDatabaseName(DEFAULT_TEST_DATABASE_URL)).toBe('eventpulse_test');
    expect(assertSafeTestDatabaseUrl(DEFAULT_TEST_DATABASE_URL, { NODE_ENV: 'test' })).toBe(
      'eventpulse_test',
    );
  });

  it('requires a _test suffix and a PostgreSQL URL', () => {
    expect(() =>
      testDatabaseName('postgresql://eventpulse:eventpulse@localhost:5432/eventpulse'),
    ).toThrow(/_test/);
    expect(() => testDatabaseName('mysql://localhost/eventpulse_test')).toThrow(/PostgreSQL/);
  });

  it('rejects malformed URLs without leaking credentials', () => {
    for (const malformed of [
      'not-a-url',
      'postgresql://',
      'postgresql://user:secret@localhost:notaport/eventpulse_test',
      'postgresql://user:secret@localhost:5432/',
    ]) {
      expect(() => testDatabaseName(malformed)).toThrow();
    }

    expect(() => testDatabaseName('not-a-url')).toThrow(/valid absolute URL/);
  });

  it('decodes percent-encoded database names before validating them', () => {
    expect(
      testDatabaseName('postgresql://eventpulse:eventpulse@localhost:5432/%65ventpulse_test'),
    ).toBe('eventpulse_test');
  });

  it('accepts every documented local host', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(
        assertSafeTestDatabaseUrl(
          `postgresql://eventpulse:eventpulse@${host}:5432/eventpulse_test`,
          { NODE_ENV: 'test' },
        ),
      ).toBe('eventpulse_test');
    }
  });

  it('refuses production-like database names', () => {
    for (const name of [
      'eventpulse_production_test',
      'eventpulse_prod_test',
      'eventpulse_staging_test',
      'staging_test',
      'prod_test',
    ]) {
      expect(() =>
        assertSafeTestDatabaseUrl(`postgresql://eventpulse:eventpulse@localhost:5432/${name}`, {
          NODE_ENV: 'test',
        }),
      ).toThrow(/production or staging/);
    }
  });

  it('refuses NODE_ENV=production', () => {
    expect(() =>
      assertSafeTestDatabaseUrl(DEFAULT_TEST_DATABASE_URL, {
        NODE_ENV: 'production',
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it('refuses remote hosts unless explicitly allowed', () => {
    const remote = 'postgresql://eventpulse:eventpulse@db.example.com:5432/eventpulse_test';

    expect(() => assertSafeTestDatabaseUrl(remote, { NODE_ENV: 'test' })).toThrow(
      /remote test database host/,
    );
    expect(
      assertSafeTestDatabaseUrl(remote, {
        NODE_ENV: 'test',
        ALLOW_REMOTE_TEST_DATABASE: 'true',
      }),
    ).toBe('eventpulse_test');
  });

  it('requires the remote opt-in to be exactly "true"', () => {
    const remote = 'postgresql://eventpulse:eventpulse@db.example.com:5432/eventpulse_test';

    for (const value of ['TRUE', '1', 'yes', '']) {
      expect(() =>
        assertSafeTestDatabaseUrl(remote, {
          NODE_ENV: 'test',
          ALLOW_REMOTE_TEST_DATABASE: value,
        }),
      ).toThrow(/remote test database host/);
    }
  });

  it('prefers TEST_DATABASE_URL over the default', () => {
    const explicit = 'postgresql://eventpulse:eventpulse@localhost:5432/custom_test';

    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: explicit })).toBe(explicit);
    expect(resolveTestDatabaseUrl({})).toBe(DEFAULT_TEST_DATABASE_URL);
  });

  it('validates the URL before constructing a Prisma client', () => {
    expect(() =>
      createTestClient('postgresql://eventpulse:eventpulse@localhost:5432/eventpulse'),
    ).toThrow(/_test/);
  });

  it('rejects an out-of-range pool size before connecting', () => {
    for (const poolSize of [0, -1, 1.5, Number.NaN, 101]) {
      expect(() => createTestClient(DEFAULT_TEST_DATABASE_URL, poolSize)).toThrow(
        /between 1 and 100/,
      );
      expect(() => assertSafePoolSize(poolSize)).toThrow(/between 1 and 100/);
    }

    expect(() => assertSafePoolSize(1)).not.toThrow();
    expect(() => assertSafePoolSize(100)).not.toThrow();
  });

  it('recognizes duplicate_database failures from pg and Prisma shapes', () => {
    expect(isDuplicateDatabaseFailure(duplicateDatabaseError())).toBe(true);
    expect(
      isDuplicateDatabaseFailure({
        code: 'P2010',
        meta: { code: '42P04', message: 'ERROR: database "eventpulse_test" already exists' },
      }),
    ).toBe(true);
    expect(isDuplicateDatabaseFailure(new Error('ERROR: database "x" already exists'))).toBe(true);
    expect(isDuplicateDatabaseFailure(new Error('permission denied'))).toBe(false);
    expect(isDuplicateDatabaseFailure({ code: '42501' })).toBe(false);
  });

  it('creates the database only when it is missing', async () => {
    let executions = 0;
    const execute = async (): Promise<number> => {
      executions += 1;
      return 0;
    };

    await expect(
      createDatabaseIfMissing(adminStub(true, execute), 'eventpulse_test'),
    ).resolves.toBe(false);
    expect(executions).toBe(0);

    await expect(
      createDatabaseIfMissing(adminStub(false, execute), 'eventpulse_test'),
    ).resolves.toBe(true);
    expect(executions).toBe(1);
  });

  it('tolerates losing a concurrent CREATE DATABASE race', async () => {
    const execute = async (): Promise<number> => {
      throw duplicateDatabaseError();
    };

    await expect(
      createDatabaseIfMissing(adminStub(false, execute), 'eventpulse_test'),
    ).resolves.toBe(false);
  });

  it('propagates real creation failures', async () => {
    const execute = async (): Promise<number> => {
      throw new Error('permission denied for database postgres');
    };

    await expect(
      createDatabaseIfMissing(adminStub(false, execute), 'eventpulse_test'),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuses to issue SQL for an unsafe database name', async () => {
    let executions = 0;

    await expect(
      createDatabaseIfMissing(
        adminStub(false, async () => {
          executions += 1;
          return 0;
        }),
        'eventpulse; DROP TABLE users',
      ),
    ).rejects.toThrow(/unsafe name/);
    expect(executions).toBe(0);
  });
});
