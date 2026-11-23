import { afterAll, describe, expect, it } from 'vitest';
import { expectFailure, expectSqlState } from './helpers/assertions.js';
import { createTestClient } from './helpers/database.js';
import { createApiKey, createTenant, unique, uniqueEmail } from './helpers/factories.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

async function insertApiKeyRaw(scopesSql: string) {
  const tenant = await createTenant(client);

  return client.$executeRawUnsafe(
    `INSERT INTO "api_keys" ("organization_id", "name", "key_prefix", "key_hash", "scopes", "created_by_user_id", "updated_at") VALUES ($1::uuid, $2, $3, $4, ${scopesSql}, $5::uuid, now())`,
    tenant.organization.id,
    unique('key'),
    uniqueEmail('prefix').slice(0, 16),
    unique('hash'),
    tenant.user.id,
  );
}

describe('api_keys.scopes constraint', () => {
  it('accepts the documented ingestion:write scope', async () => {
    const tenant = await createTenant(client);
    const apiKey = await createApiKey(client, {
      organizationId: tenant.organization.id,
      createdByUserId: tenant.user.id,
      scopes: ['ingestion:write'],
    });

    expect(apiKey.scopes).toEqual(['ingestion:write']);
  });

  it('rejects an invented scope', async () => {
    await expectFailure(insertApiKeyRaw("ARRAY['admin']::text[]"), /api_keys_scopes_chk/i);
  });

  it('rejects a mix containing an invented scope', async () => {
    await expectFailure(
      insertApiKeyRaw("ARRAY['ingestion:write', 'admin']::text[]"),
      /api_keys_scopes_chk/i,
    );
  });

  it('rejects a NULL scopes value', async () => {
    await expectFailure(insertApiKeyRaw('NULL'), /23502|null|not-null|not null|failing row/i);
  });

  it('accepts an empty scopes array, as documented by the literal CHECK', async () => {
    const tenant = await createTenant(client);
    const apiKey = await createApiKey(client, {
      organizationId: tenant.organization.id,
      createdByUserId: tenant.user.id,
      scopes: [],
    });

    expect(apiKey.scopes).toEqual([]);
  });

  it('accepts duplicate scopes because no business rule forbids them yet', async () => {
    const tenant = await createTenant(client);
    const apiKey = await createApiKey(client, {
      organizationId: tenant.organization.id,
      createdByUserId: tenant.user.id,
      scopes: ['ingestion:write', 'ingestion:write'],
    });

    expect(apiKey.scopes).toEqual(['ingestion:write', 'ingestion:write']);
  });

  it('rejects a NULL element inside the scopes array', async () => {
    // Array containment is not NULL-tolerant: a NULL element makes the CHECK
    // evaluate to false, so PostgreSQL rejects the row with SQLSTATE 23514.
    await expectSqlState(
      insertApiKeyRaw("ARRAY['ingestion:write', NULL]::text[]"),
      '23514',
      /api_keys_scopes_chk/i,
    );
  });
});
