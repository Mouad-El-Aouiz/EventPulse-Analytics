import { afterAll, describe, expect, it } from 'vitest';
import { TRIGRAM_INDEXES } from '../../src/database/integrity-manifest.js';
import { createTestClient } from './helpers/database.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('trigram indexes', () => {
  it('declares valid non-unique GIN gin_trgm_ops indexes with exact definitions', async () => {
    const placeholders = TRIGRAM_INDEXES.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await client.$queryRawUnsafe<
      Array<{
        index_name: string;
        table_name: string;
        method: string;
        indisunique: boolean;
        indisvalid: boolean;
        indisready: boolean;
        indnkeyatts: number;
        indnatts: number;
        definition: string;
      }>
    >(
      `SELECT
         i.relname AS index_name,
         t.relname AS table_name,
         am.amname AS method,
         x.indisunique,
         x.indisvalid,
         x.indisready,
         x.indnkeyatts,
         x.indnatts,
         pg_get_indexdef(x.indexrelid) AS definition
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_am am ON am.oid = i.relam
       WHERE i.relname IN (${placeholders})`,
      ...TRIGRAM_INDEXES.map((index) => index.name),
    );

    expect(rows).toHaveLength(TRIGRAM_INDEXES.length);

    for (const expected of TRIGRAM_INDEXES) {
      const actual = rows.find((row) => row.index_name === expected.name);

      expect(actual, `index ${expected.name}`).toBeDefined();
      expect(actual?.table_name).toBe(expected.table);
      expect(actual?.method).toBe('gin');
      expect(actual?.indisunique).toBe(false);
      expect(actual?.indisvalid).toBe(true);
      expect(actual?.indisready).toBe(true);
      expect(actual?.indnkeyatts).toBe(1);
      expect(actual?.indnatts).toBe(1);
      expect(normalize(actual?.definition ?? '')).toBe(normalize(expected.definition));
    }
  });

  it('uses the varchar trigram indexes for ILIKE searches', async () => {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const cases = [
        { table: 'participants', column: 'last_name', index: 'participants_last_name_trgm_idx' },
        { table: 'exhibitors', column: 'name', index: 'exhibitors_name_trgm_idx' },
        { table: 'events', column: 'name', index: 'events_name_trgm_idx' },
      ];

      for (const { table, column, index } of cases) {
        const rows = await tx.$queryRawUnsafe<Array<Record<string, string>>>(
          `EXPLAIN (FORMAT TEXT) SELECT "id" FROM "${table}" WHERE "${column}" ILIKE '%test%'`,
        );
        const plan = rows.map((row) => Object.values(row)[0] ?? '').join('\n');

        expect(plan, `${table}.${column}`).toContain(index);
      }
    });
  });

  it('uses the email expression index for ILIKE on the text cast', async () => {
    // enable_seqscan=off forces the planner to consider the index. This proves
    // expression compatibility, not that production queries will always choose it.
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const rows = await tx.$queryRawUnsafe<Array<Record<string, string>>>(
        'EXPLAIN (FORMAT TEXT) SELECT "id" FROM "participants" WHERE ("email")::text ILIKE \'%ada%\'',
      );
      const plan = rows.map((row) => Object.values(row)[0] ?? '').join('\n');

      expect(plan).toContain('participants_email_trgm_idx');
    });
  });
});
