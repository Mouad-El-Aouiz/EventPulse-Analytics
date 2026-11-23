import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeMigrationDirectory,
  analyzeMigrationSql,
  type MigrationFile,
} from '../../../src/database/migration-safety.js';

function file(sql: string): MigrationFile {
  return { path: 'test/migration.sql', sql };
}

function messages(sql: string): string[] {
  return analyzeMigrationSql([file(sql)]).map((item) => item.message);
}

describe('migration safety scanner', () => {
  it('accepts a protected drop with an explicit local directive', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow DROP CONSTRAINT registrations_ticket_org_fk (replaced)',
          'ALTER TABLE "registrations" DROP CONSTRAINT "registrations_ticket_org_fk";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toEqual([]);
  });

  it('rejects a protected drop without an allow directive', () => {
    const findings = analyzeMigrationSql([
      file('ALTER TABLE "registrations" DROP CONSTRAINT "registrations_event_org_fk";'),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('registrations_event_org_fk');
  });

  it('ignores drops of objects that are not protected', () => {
    const findings = analyzeMigrationSql([file('DROP INDEX "some_temporary_index";')]);

    expect(findings).toEqual([]);
  });

  it('blocks the tear-down statements proposed by prisma migrate diff', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'ALTER TABLE "booths" DROP CONSTRAINT "booths_event_org_fk";',
          'DROP INDEX "booths_org_event_id_uq";',
          'DROP INDEX "events_name_trgm_idx";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(3);
    expect(findings[0]?.message).toContain('booths_event_org_fk');
    expect(findings[1]?.message).toContain('booths_org_event_id_uq');
    expect(findings[2]?.message).toContain('events_name_trgm_idx');
  });

  it('does not let one directive authorize a second instruction', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow DROP CONSTRAINT registrations_ticket_org_fk (replaced)',
          'ALTER TABLE "registrations" DROP CONSTRAINT "registrations_ticket_org_fk";',
          'ALTER TABLE "registrations" DROP CONSTRAINT "registrations_event_org_fk";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(3);
    expect(findings[0]?.message).toContain('registrations_event_org_fk');
  });

  it('requires the directive object type to match the protected object', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow DROP INDEX registrations_event_org_fk (wrong type)',
          'ALTER TABLE "registrations" DROP CONSTRAINT "registrations_event_org_fk";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(2);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/registrations_event_org_fk/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/unused/);
  });

  it('rejects an unused directive', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow DROP CONSTRAINT registrations_ticket_org_fk (unused)',
          'SELECT 1;',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('unused');
  });

  it('rejects a malformed directive', () => {
    const findings = analyzeMigrationSql([
      file('-- integrity-guard: allow registrations_ticket_org_fk'),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('Malformed');
  });

  it('detects a protected drop split across several lines', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'ALTER TABLE "registrations"',
          '  DROP CONSTRAINT',
          '  "registrations_event_org_fk";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(1);
    expect(findings[0]?.message).toContain('registrations_event_org_fk');
  });

  it('ignores block comments and string literals', () => {
    expect(
      messages(
        [
          '/* DROP TABLE "refunds"; */',
          'SELECT \'DROP TABLE "refunds";\';',
          'SELECT $$DROP TABLE "refunds";$$;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('analyzes executable dollar-quoted function bodies', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$',
          'BEGIN',
          '  DROP TABLE "refunds";',
          'END;',
          '$$;',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('refunds');
  });

  it('rejects DISABLE TRIGGER ALL/USER and ENABLE REPLICA/ALWAYS even with a directive', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow ALTER TRIGGER trg_refund_cap (not sufficient)',
          'ALTER TABLE "refunds"',
          '  DISABLE TRIGGER USER;',
          'ALTER TABLE "refunds" ENABLE REPLICA TRIGGER "trg_refund_cap";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(3);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/disabled/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/firing mode/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/unused/);
  });

  it('detects organization_id drop, rename, type change and nullability change', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'ALTER TABLE "registrations" DROP organization_id;',
          'ALTER TABLE "registrations" RENAME COLUMN organization_id TO org_id;',
          'ALTER TABLE "registrations" ALTER organization_id TYPE text;',
          'ALTER TABLE "registrations" ALTER COLUMN organization_id DROP NOT NULL;',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(4);
    expect(findings.map((item) => item.line)).toEqual([1, 2, 3, 4]);
  });

  it('detects session_replication_role changes with = and TO', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          "SET session_replication_role = 'replica';",
          'ALTER DATABASE eventpulse SET session_replication_role TO replica;',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(2);
  });

  it('detects schema-qualified drops, concurrent index drops and multi-object drops', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'DROP TABLE IF EXISTS public."refunds";',
          'DROP INDEX CONCURRENTLY IF EXISTS "checkins_valid_unique_uq";',
          'DROP TABLE "temp_table", public."users";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(3);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/refunds/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/checkins_valid_unique_uq/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/users/);
  });

  it('detects protected function replacement and accepts a typed directive', () => {
    const rejected = analyzeMigrationSql([
      file(
        [
          'CREATE OR REPLACE FUNCTION "enforce_refund_cap"() RETURNS trigger LANGUAGE plpgsql AS $$',
          'BEGIN',
          '  RETURN NEW;',
          'END;',
          '$$;',
        ].join('\n'),
      ),
    ]);
    const accepted = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow CREATE FUNCTION enforce_refund_cap (approved hardening)',
          'CREATE OR REPLACE FUNCTION "enforce_refund_cap"() RETURNS trigger LANGUAGE plpgsql AS $$',
          'BEGIN',
          '  RETURN NEW;',
          'END;',
          '$$;',
        ].join('\n'),
      ),
    ]);

    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.message).toContain('enforce_refund_cap');
    expect(accepted).toEqual([]);
  });

  it('rejects destructive schema, database, role, extension and truncate statements', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'DROP EXTENSION IF EXISTS "citext";',
          'DROP ROLE "eventpulse_app";',
          'DROP SCHEMA "public" CASCADE;',
          'DROP DATABASE "eventpulse";',
          'DROP OWNED BY "eventpulse_app";',
          'TRUNCATE TABLE "refunds";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(6);
  });

  it('rejects unterminated strings and comments', () => {
    expect(messages("SELECT 'unterminated;")).toHaveLength(1);
    expect(messages('/* unterminated')).toHaveLength(1);
    expect(messages('DO $$ unterminated')).toHaveLength(1);
  });

  it('requires the directive to be immediately local', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow DROP CONSTRAINT registrations_ticket_org_fk (reason)',
          '',
          'ALTER TABLE "registrations" DROP CONSTRAINT "registrations_ticket_org_fk";',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(2);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/not local/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/registrations_ticket_org_fk/);
  });

  it('detects protected renames of triggers, constraints, indexes, roles and schemas', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'ALTER TRIGGER "trg_refund_cap" ON "refunds" RENAME TO "trg_renamed";',
          'ALTER TABLE "registrations" RENAME CONSTRAINT "registrations_event_org_fk" TO "registrations_event_fk";',
          'ALTER INDEX "checkins_valid_unique_uq" RENAME TO "checkins_valid_idx";',
          'ALTER ROLE "eventpulse_app" RENAME TO "eventpulse_runtime";',
          'ALTER SCHEMA "public" RENAME TO "app";',
        ].join('\n'),
      ),
    ]);
    const text = findings.map((item) => item.message).join('\n');

    expect(text).toMatch(/trg_refund_cap/);
    expect(text).toMatch(/registrations_event_org_fk/);
    expect(text).toMatch(/checkins_valid_unique_uq/);
    expect(text).toMatch(/eventpulse_app/);
    expect(text).toMatch(/public/);
  });

  it('detects every protected extension in a multi-extension drop', () => {
    const findings = analyzeMigrationSql([file('DROP EXTENSION IF EXISTS "citext", "pg_trgm";')]);
    const text = findings.map((item) => item.message).join('\n');

    expect(findings).toHaveLength(2);
    expect(text).toMatch(/citext/);
    expect(text).toMatch(/pg_trgm/);
  });

  it('rejects trailing, duplicate and ambiguous directives', () => {
    const trailing = analyzeMigrationSql([
      file('SELECT 1; -- integrity-guard: allow DROP TABLE "refunds" (trailing)'),
    ]);
    const duplicate = analyzeMigrationSql([
      file(
        [
          '-- integrity-guard: allow DROP TABLE "refunds" (first)',
          '-- integrity-guard: allow DROP TABLE "refunds" (second)',
          'DROP TABLE "refunds";',
        ].join('\n'),
      ),
    ]);

    expect(trailing.map((item) => item.message).join('\n')).toMatch(/own line/);
    expect(duplicate.map((item) => item.message).join('\n')).toMatch(/Ambiguous/);
  });

  it('rejects schema-qualified directive names as malformed', () => {
    const findings = analyzeMigrationSql([
      file('-- integrity-guard: allow DROP TABLE public.refunds (ambiguous)'),
    ]);

    expect(findings.map((item) => item.message).join('\n')).toMatch(/Malformed/);
  });

  it('detects indirect organization_id changes and destructive cascades', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'ALTER TABLE "registrations" RENAME COLUMN "tenant" TO "organization_id";',
          'ALTER TABLE "registrations" ALTER COLUMN "organization_id" SET DEFAULT \'00000000-0000-0000-0000-000000000000\';',
          'UPDATE "registrations" SET "organization_id" = \'00000000-0000-0000-0000-000000000000\';',
          'ALTER TABLE "registrations" DROP COLUMN "legacy" CASCADE;',
        ].join('\n'),
      ),
    ]);

    expect(findings).toHaveLength(4);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/organization_id/);
    expect(findings.map((item) => item.message).join('\n')).toMatch(/CASCADE/);
  });

  it('detects trigger re-enablement and firing-mode changes', () => {
    const normal = analyzeMigrationSql([
      file('ALTER TABLE "refunds" ENABLE TRIGGER "trg_refund_cap";'),
    ]);
    const replica = analyzeMigrationSql([
      file('ALTER TABLE "refunds" ENABLE REPLICA TRIGGER "trg_refund_cap";'),
    ]);
    const disabled = analyzeMigrationSql([
      file('ALTER TABLE "refunds" DISABLE TRIGGER "trg_refund_cap";'),
    ]);

    expect(normal.map((item) => item.message).join('\n')).toMatch(/manual review/);
    expect(replica.map((item) => item.message).join('\n')).toMatch(/firing mode/);
    expect(disabled.map((item) => item.message).join('\n')).toMatch(/disabled/);
  });

  it('detects dangerous privilege changes', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'GRANT ALL ON TABLE "refunds" TO "eventpulse_app";',
          'GRANT SELECT ON TABLE "refunds" TO PUBLIC;',
          'GRANT UPDATE ON TABLE "refunds" TO "eventpulse_app";',
          'GRANT TRUNCATE ON TABLE "refunds" TO "eventpulse_app";',
          'GRANT TEMP ON DATABASE eventpulse TO "eventpulse_app";',
          'GRANT "eventpulse_app" TO "someone";',
          'ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT ON TABLES TO PUBLIC;',
          'ALTER ROLE "eventpulse_app" SUPERUSER;',
          'SET ROLE "eventpulse_app";',
          'SET SESSION AUTHORIZATION "eventpulse";',
          'ALTER TABLE "refunds" OWNER TO "eventpulse_app";',
        ].join('\n'),
      ),
    ]);
    const text = findings.map((item) => item.message).join('\n');

    expect(text).toMatch(/GRANT ALL/);
    expect(text).toMatch(/PUBLIC/);
    expect(text).toMatch(/UPDATE or DELETE/);
    expect(text).toMatch(/TRUNCATE/);
    expect(text).toMatch(/TEMP/);
    expect(text).toMatch(/escalate/);
    expect(text).toMatch(/DEFAULT PRIVILEGES/);
    expect(text).toMatch(/dangerous attribute/);
    expect(text).toMatch(/SET ROLE/);
    expect(text).toMatch(/SESSION AUTHORIZATION/);
    expect(text).toMatch(/OWNER TO/);
  });

  it('ignores PostgreSQL string variants while analyzing dollar bodies', () => {
    expect(
      messages(
        [
          'SELECT E\'DROP TABLE "refunds";\';',
          'SELECT U&\'DROP TABLE "refunds";\';',
          'SELECT $tag$DROP TABLE "refunds";$tag$;',
          'DO $$ BEGIN RAISE NOTICE \'DROP TABLE "refunds";\'; END $$;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('rejects directives inside executable bodies', () => {
    const findings = analyzeMigrationSql([
      file(
        [
          'CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$',
          'BEGIN',
          '  -- integrity-guard: allow DROP TABLE "refunds" (inside body)',
          '  DROP TABLE "refunds";',
          'END;',
          '$$;',
        ].join('\n'),
      ),
    ]);
    const text = findings.map((item) => item.message).join('\n');

    expect(text).toMatch(/not allowed inside executable bodies/);
    expect(text).toMatch(/refunds/);
  });

  it('reports incomplete migration directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eventpulse-migrations-'));

    try {
      await mkdir(join(root, '20260101000000_incomplete'));
      await mkdir(join(root, '20260101000001_complete'));
      await writeFile(join(root, '20260101000001_complete', 'migration.sql'), 'SELECT 1;');

      const findings = await analyzeMigrationDirectory(root);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.file).toBe(join('20260101000000_incomplete', 'migration.sql'));
      expect(findings[0]?.message).toMatch(/Incomplete migration directory/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('passes the real migrations directory', async () => {
    const directory = fileURLToPath(new URL('../../../prisma/migrations', import.meta.url));
    const findings = await analyzeMigrationDirectory(directory);

    expect(findings).toEqual([]);
  });
});
