import { afterAll, describe, expect, it } from 'vitest';
import {
  IMMUTABLE_TABLES,
  MUTABLE_TABLES,
  RUNTIME_GROUP_ROLE,
} from '../../src/database/integrity-manifest.js';
import { expectFailure } from './helpers/assertions.js';
import { createTestClient } from './helpers/database.js';
import { createOrganization } from './helpers/factories.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

interface Privileges {
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_truncate: boolean;
  can_references: boolean;
  can_trigger: boolean;
}

async function tablePrivileges(table: string): Promise<Privileges> {
  const rows = await client.$queryRaw<Privileges[]>`
    SELECT
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'SELECT') AS can_select,
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'INSERT') AS can_insert,
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'UPDATE') AS can_update,
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'DELETE') AS can_delete,
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'TRUNCATE') AS can_truncate,
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'REFERENCES') AS can_references,
      has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${table}`}, 'TRIGGER') AS can_trigger
  `;
  const privileges = rows[0];

  if (privileges === undefined) {
    throw new Error(`Unable to read privileges for ${table}`);
  }

  return privileges;
}

const runtimeLoginRole = process.env.TEST_RUNTIME_LOGIN_ROLE;

describe('runtime role privileges', () => {
  it('runs against an isolated database whose name ends with _test', async () => {
    const rows = await client.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;

    expect(rows[0]?.name).toMatch(/_test$/);
  });

  it('defines a locked down group role without login', async () => {
    const rows = await client.$queryRaw<
      Array<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>
    >`
      SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles
      WHERE rolname = ${RUNTIME_GROUP_ROLE}
    `;
    const role = rows[0];

    expect(role).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    });
  });

  it('has no CREATE privilege on the current database', async () => {
    const rows = await client.$queryRaw<Array<{ can_create: boolean; can_connect: boolean }>>`
      SELECT
        has_database_privilege(${RUNTIME_GROUP_ROLE}, current_database(), 'CREATE') AS can_create,
        has_database_privilege(${RUNTIME_GROUP_ROLE}, current_database(), 'CONNECT') AS can_connect
    `;

    expect(rows[0]).toEqual({ can_create: false, can_connect: true });
  });

  it('still inherits the default TEMP privilege on the database', async () => {
    // PostgreSQL grants TEMP to PUBLIC by default. The migration cannot revoke
    // it portably because it does not know the database name. The refund
    // trigger defends against temp-table shadowing by schema qualification and
    // a fixed search_path instead; this test records the residual privilege.
    const rows = await client.$queryRaw<Array<{ can_temp: boolean }>>`
      SELECT has_database_privilege(${RUNTIME_GROUP_ROLE}, current_database(), 'TEMP') AS can_temp
    `;

    expect(rows[0]).toEqual({ can_temp: true });
  });

  it('has USAGE but not CREATE on the public schema', async () => {
    const rows = await client.$queryRaw<Array<{ can_use: boolean; can_create: boolean }>>`
      SELECT
        has_schema_privilege(${RUNTIME_GROUP_ROLE}, 'public', 'USAGE') AS can_use,
        has_schema_privilege(${RUNTIME_GROUP_ROLE}, 'public', 'CREATE') AS can_create
    `;

    expect(rows[0]).toEqual({ can_use: true, can_create: false });
  });

  it('does not own any business table', async () => {
    const rows = await client.$queryRaw<Array<{ owner: string }>>`
      SELECT DISTINCT pg_get_userbyid(relowner) AS owner
      FROM pg_class
      WHERE relkind = 'r'
        AND relnamespace = 'public'::regnamespace
    `;

    expect(rows.map((row) => row.owner)).not.toContain(RUNTIME_GROUP_ROLE);
  });

  it('connects as a role distinct from the runtime group', async () => {
    const rows = await client.$queryRaw<Array<{ current_user: string }>>`
      SELECT current_user
    `;

    expect(rows[0]?.current_user).not.toBe(RUNTIME_GROUP_ROLE);
  });

  it('is not a member of any other database role', async () => {
    const rows = await client.$queryRaw<Array<{ role_name: string }>>`
      SELECT granted.rolname AS role_name
      FROM pg_auth_members memberships
      JOIN pg_roles member ON member.oid = memberships.member
      JOIN pg_roles granted ON granted.oid = memberships.roleid
      WHERE member.rolname = ${RUNTIME_GROUP_ROLE}
        AND granted.rolname <> ${RUNTIME_GROUP_ROLE}
    `;

    expect(rows).toEqual([]);
  });

  it('has no privilege on sequences in the public schema', async () => {
    const sequences = await client.$queryRaw<Array<{ sequence_name: string }>>`
      SELECT c.relname AS sequence_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'S'
    `;

    for (const sequence of sequences) {
      const rows = await client.$queryRaw<
        Array<{ can_usage: boolean; can_select: boolean; can_update: boolean }>
      >`
        SELECT
          has_sequence_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${sequence.sequence_name}`}, 'USAGE') AS can_usage,
          has_sequence_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${sequence.sequence_name}`}, 'SELECT') AS can_select,
          has_sequence_privilege(${RUNTIME_GROUP_ROLE}, ${`public.${sequence.sequence_name}`}, 'UPDATE') AS can_update
      `;

      expect(rows[0]).toEqual({
        can_usage: false,
        can_select: false,
        can_update: false,
      });
    }

    expect(sequences).toEqual([]);
  });

  it('has no privilege on the Prisma migrations table', async () => {
    expect(await tablePrivileges('_prisma_migrations')).toEqual({
      can_select: false,
      can_insert: false,
      can_update: false,
      can_delete: false,
      can_truncate: false,
      can_references: false,
      can_trigger: false,
    });
  });

  it('grants SELECT and INSERT only on immutable tables', async () => {
    for (const table of IMMUTABLE_TABLES) {
      expect(await tablePrivileges(table)).toEqual({
        can_select: true,
        can_insert: true,
        can_update: false,
        can_delete: false,
        can_truncate: false,
        can_references: false,
        can_trigger: false,
      });
    }
  });

  it('grants SELECT, INSERT, UPDATE and DELETE on mutable tables', async () => {
    for (const table of MUTABLE_TABLES) {
      expect(await tablePrivileges(table)).toEqual({
        can_select: true,
        can_insert: true,
        can_update: true,
        can_delete: true,
        can_truncate: false,
        can_references: false,
        can_trigger: false,
      });
    }
  });

  it('denies UPDATE on refunds when acting as the runtime role', async () => {
    await expectFailure(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RUNTIME_GROUP_ROLE}"`);
        await tx.$executeRawUnsafe('UPDATE "refunds" SET "reason" = \'x\' WHERE false');
      }),
      /permission denied/i,
    );
  });

  it('denies DELETE on check_ins when acting as the runtime role', async () => {
    await expectFailure(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RUNTIME_GROUP_ROLE}"`);
        await tx.$executeRawUnsafe('DELETE FROM "check_ins" WHERE false');
      }),
      /permission denied/i,
    );
  });

  it('denies TRUNCATE on audit_logs when acting as the runtime role', async () => {
    await expectFailure(
      client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RUNTIME_GROUP_ROLE}"`);
        await tx.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"');
      }),
      /permission denied/i,
    );
  });

  it('allows UPDATE on a mutable table when acting as the runtime role', async () => {
    const organization = await createOrganization(client);

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RUNTIME_GROUP_ROLE}"`);
      await tx.$executeRawUnsafe(
        'UPDATE "organizations" SET "name" = $2 WHERE "id" = $1::uuid',
        organization.id,
        'Runtime Rename',
      );
    });

    const updated = await client.organization.findUniqueOrThrow({
      where: { id: organization.id },
      select: { name: true },
    });

    expect(updated.name).toBe('Runtime Rename');
  });
});

describe.skipIf(runtimeLoginRole === undefined)('optional runtime login role', () => {
  it('logs in, inherits the runtime group, and has no elevated attributes', async () => {
    const roles = await client.$queryRaw<
      Array<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
        rolinherit: boolean;
      }>
    >`
      SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
      FROM pg_roles
      WHERE rolname = ${runtimeLoginRole}
    `;

    expect(roles).toEqual([
      {
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        rolinherit: true,
      },
    ]);

    const memberships = await client.$queryRaw<
      Array<{ admin_option: boolean; inherit_option: boolean }>
    >`
      SELECT am.admin_option, am.inherit_option
      FROM pg_auth_members am
      JOIN pg_roles member ON member.oid = am.member
      JOIN pg_roles granted ON granted.oid = am.roleid
      WHERE member.rolname = ${runtimeLoginRole}
        AND granted.rolname = ${RUNTIME_GROUP_ROLE}
    `;

    expect(memberships).toEqual([{ admin_option: false, inherit_option: true }]);
  });
});
