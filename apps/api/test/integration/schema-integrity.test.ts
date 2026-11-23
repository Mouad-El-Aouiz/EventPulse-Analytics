import { afterAll, describe, expect, it } from 'vitest';
import { verifyDatabaseIntegrity } from '../../src/database/integrity.js';
import { createTestClient } from './helpers/database.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

describe('PostgreSQL catalog integrity', () => {
  it('matches the full integrity manifest', async () => {
    const report = await verifyDatabaseIntegrity(client);

    expect(report.errors).toEqual([]);
    expect(report.checked).toBe(126);
  });
});
