import { afterAll, describe, expect, it } from 'vitest';
import { UPDATED_AT_TABLES } from '../../src/database/integrity-manifest.js';
import { createTestClient } from './helpers/database.js';
import {
  createOrganization,
  createParticipant,
  createTenant,
  unique,
} from './helpers/factories.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

async function readUpdatedAt(organizationId: string): Promise<Date> {
  const organization = await client.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { updatedAt: true },
  });

  return organization.updatedAt;
}

describe('updated_at trigger', () => {
  it('refreshes updated_at when a direct SQL update omits it', async () => {
    const organization = await createOrganization(client);

    await client.$executeRawUnsafe(
      'UPDATE "organizations" SET "updated_at" = now() - interval \'1 hour\' WHERE "id" = $1::uuid',
      organization.id,
    );
    const before = await readUpdatedAt(organization.id);

    await client.$executeRawUnsafe(
      'UPDATE "organizations" SET "name" = $2 WHERE "id" = $1::uuid',
      organization.id,
      unique('Renamed'),
    );
    const after = await readUpdatedAt(organization.id);

    expect(after.getTime()).toBeGreaterThan(before.getTime() + 30 * 60 * 1000);
  });

  it('respects an explicit different updated_at value', async () => {
    const organization = await createOrganization(client);
    const explicit = new Date(Date.now() + 60 * 60 * 1000);

    await client.$executeRawUnsafe(
      'UPDATE "organizations" SET "name" = $2, "updated_at" = $3::timestamptz WHERE "id" = $1::uuid',
      organization.id,
      unique('Renamed'),
      explicit,
    );
    const after = await readUpdatedAt(organization.id);

    expect(after.getTime()).toBe(explicit.getTime());
  });

  it('refreshes updated_at when the explicit value equals the previous one', async () => {
    const organization = await createOrganization(client);

    await client.$executeRawUnsafe(
      'UPDATE "organizations" SET "updated_at" = now() - interval \'1 hour\' WHERE "id" = $1::uuid',
      organization.id,
    );
    const before = await readUpdatedAt(organization.id);

    await client.$executeRawUnsafe(
      'UPDATE "organizations" SET "name" = $2, "updated_at" = "updated_at" WHERE "id" = $1::uuid',
      organization.id,
      unique('Renamed'),
    );
    const after = await readUpdatedAt(organization.id);

    expect(after.getTime()).toBeGreaterThan(before.getTime() + 30 * 60 * 1000);
  });

  it('is not installed on immutable tables', async () => {
    const rows = await client.$queryRaw<Array<{ table_name: string; count: bigint }>>`
      SELECT t.relname AS table_name, count(*)::bigint AS count
      FROM pg_trigger tg
      JOIN pg_class t ON t.oid = tg.tgrelid
      WHERE NOT tg.tgisinternal
        AND tg.tgname = 'trg_touch_updated_at'
        AND t.relname IN ('check_ins', 'refunds', 'audit_logs')
      GROUP BY t.relname
    `;

    expect(rows).toEqual([]);
  });

  it('covers exactly the tables declared with updated_at in the manifest', async () => {
    const rows = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT t.relname AS table_name
      FROM pg_trigger tg
      JOIN pg_class t ON t.oid = tg.tgrelid
      WHERE NOT tg.tgisinternal
        AND tg.tgname = 'trg_touch_updated_at'
      ORDER BY t.relname
    `;

    expect(rows.map((row) => row.table_name)).toEqual([...UPDATED_AT_TABLES].sort());
  });

  it('installs a single enabled BEFORE UPDATE FOR EACH ROW trigger per table', async () => {
    const rows = await client.$queryRaw<
      Array<{
        table_name: string;
        row_level: boolean;
        before: boolean;
        on_update: boolean;
        on_insert: boolean;
        on_delete: boolean;
        enabled: string;
      }>
    >`
      SELECT
        t.relname AS table_name,
        (tg.tgtype & 1) = 1 AS row_level,
        (tg.tgtype & 2) = 2 AS before,
        (tg.tgtype & 16) = 16 AS on_update,
        (tg.tgtype & 4) = 4 AS on_insert,
        (tg.tgtype & 8) = 8 AS on_delete,
        tg.tgenabled AS enabled
      FROM pg_trigger tg
      JOIN pg_class t ON t.oid = tg.tgrelid
      WHERE NOT tg.tgisinternal
        AND tg.tgname = 'trg_touch_updated_at'
    `;

    expect(rows).toHaveLength(UPDATED_AT_TABLES.length);

    for (const row of rows) {
      expect(row, row.table_name).toMatchObject({
        row_level: true,
        before: true,
        on_update: true,
        on_insert: false,
        on_delete: false,
        enabled: 'O',
      });
    }
  });

  it('refreshes updated_at on participants as well as organizations', async () => {
    const tenant = await createTenant(client);
    const participant = await createParticipant(client, tenant.organization.id);

    await client.$executeRawUnsafe(
      'UPDATE "participants" SET "updated_at" = now() - interval \'1 hour\' WHERE "id" = $1::uuid',
      participant.id,
    );
    const before = await client.participant.findUniqueOrThrow({
      where: { id: participant.id },
      select: { updatedAt: true },
    });

    await client.$executeRawUnsafe(
      'UPDATE "participants" SET "last_name" = $2 WHERE "id" = $1::uuid',
      participant.id,
      unique('Renamed'),
    );
    const after = await client.participant.findUniqueOrThrow({
      where: { id: participant.id },
      select: { updatedAt: true },
    });

    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime() + 30 * 60 * 1000);
  });
});
