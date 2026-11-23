import { Prisma, type PrismaClient } from '@prisma/client';
import {
  ALL_TABLES,
  CHECK_CONSTRAINTS,
  COMPOSITE_FOREIGN_KEYS,
  IMMUTABLE_TABLES,
  PARTIAL_UNIQUE_INDEXES,
  REQUIRED_NOT_NULL_COLUMNS,
  RUNTIME_GROUP_ROLE,
  SCHEMA_NAME,
  TRIGGERS,
  TRIGGER_FUNCTIONS,
  TRIGRAM_INDEXES,
  UNIQUE_CONSTRAINTS,
  type ForeignKeyAction,
  type TriggerOperation,
} from './integrity-manifest.js';

const SCHEMA = SCHEMA_NAME;

export interface IntegrityReport {
  errors: string[];
  checked: number;
}

interface ForeignKeyRow {
  conname: string;
  table_name: string;
  referenced_table: string;
  referenced_schema: string;
  columns: string[] | null;
  referenced_columns: string[] | null;
  delete_action: string;
  update_action: string;
  validated: boolean;
  deferrable: boolean;
  deferred: boolean;
  match_type: string;
}

interface PartialIndexRow {
  index_name: string;
  table_name: string;
  method: string;
  indisunique: boolean;
  indisvalid: boolean;
  indisready: boolean;
  indnkeyatts: number;
  indnatts: number;
  predicate: string | null;
  key_columns: string[] | null;
  include_columns: string[] | null;
}

interface TrigramIndexRow {
  index_name: string;
  table_name: string;
  method: string;
  indisunique: boolean;
  indisvalid: boolean;
  indisready: boolean;
  indnkeyatts: number;
  indnatts: number;
  definition: string;
}

interface CheckRow {
  conname: string;
  table_name: string;
  validated: boolean;
  definition: string;
}

interface UniqueConstraintRow {
  conname: string;
  table_name: string;
  columns: string[] | null;
  validated: boolean;
  deferrable: boolean;
  deferred: boolean;
  definition: string;
}

interface TriggerRow {
  tgname: string;
  table_name: string;
  function_schema: string;
  function_name: string;
  tgenabled: string;
  tgtype: number;
  has_when_clause: boolean;
  nargs: number;
  deferrable: boolean;
  initially_deferred: boolean;
}

interface RoleRow {
  rolname: string;
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
}

interface RoleMembershipRow {
  role_name: string;
}

interface TableOwnerRow {
  table_name: string;
  owner: string;
}

interface TablePrivilegeRow {
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_truncate: boolean;
  can_references: boolean;
  can_trigger: boolean;
}

interface SchemaPrivilegeRow {
  can_use: boolean;
  can_create: boolean;
}

interface SequenceRow {
  sequence_name: string;
}

interface SequencePrivilegeRow {
  can_usage: boolean;
  can_select: boolean;
  can_update: boolean;
}

interface NotNullRow {
  attnotnull: boolean;
}

interface FunctionRow {
  proname: string;
  schema_name: string;
  identity_arguments: string;
  result: string;
  language: string;
  security_definer: boolean;
  volatility: string;
  configuration: string[];
  definition_md5: string;
}

const ACTION_NAMES: Record<string, ForeignKeyAction> = {
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  a: 'NO ACTION',
};

function actionName(code: string): ForeignKeyAction | string {
  return ACTION_NAMES[code] ?? code;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sortedOperations(row: TriggerRow): TriggerOperation[] {
  const operations: TriggerOperation[] = [];

  if ((row.tgtype & 4) !== 0) {
    operations.push('INSERT');
  }
  if ((row.tgtype & 16) !== 0) {
    operations.push('UPDATE');
  }
  if ((row.tgtype & 8) !== 0) {
    operations.push('DELETE');
  }

  return operations.sort();
}

function indexRows<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  label: string,
  errors: string[],
): Map<string, T> {
  const map = new Map<string, T>();

  for (const row of rows) {
    const key = keyOf(row);

    if (map.has(key)) {
      errors.push(`Duplicate ${label} in catalog: ${key}`);
      continue;
    }

    map.set(key, row);
  }

  return map;
}

function functionKey(
  row: Pick<FunctionRow, 'schema_name' | 'proname' | 'identity_arguments'>,
): string {
  return `${row.schema_name}.${row.proname}(${row.identity_arguments})`;
}

export async function verifyDatabaseIntegrity(client: PrismaClient): Promise<IntegrityReport> {
  const errors: string[] = [];
  let checked = 0;

  const foreignKeys = await client.$queryRaw<ForeignKeyRow[]>`
    SELECT
      c.conname,
      t.relname AS table_name,
      ft.relname AS referenced_table,
      fn.nspname AS referenced_schema,
      (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) AS columns,
      (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum
      ) AS referenced_columns,
      c.confdeltype::text AS delete_action,
      c.confupdtype::text AS update_action,
      c.convalidated AS validated,
      c.condeferrable AS deferrable,
      c.condeferred AS deferred,
      c.confmatchtype::text AS match_type
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class ft ON ft.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_namespace fn ON fn.oid = ft.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = ${SCHEMA}
      AND array_length(c.conkey, 1) >= 2
  `;

  const foreignKeyByKey = indexRows(
    foreignKeys,
    (row) => `${row.table_name}.${row.conname}`,
    'composite foreign key',
    errors,
  );

  for (const expected of COMPOSITE_FOREIGN_KEYS) {
    checked += 1;
    const actual = foreignKeyByKey.get(`${expected.table}.${expected.name}`);

    if (actual === undefined) {
      errors.push(
        `Missing composite tenant FK: ${expected.name} on ${expected.table} -> ${expected.referencedTable}`,
      );
      continue;
    }

    if (actual.table_name !== expected.table) {
      errors.push(
        `Composite FK ${expected.name}: table is ${actual.table_name}, expected ${expected.table}`,
      );
    }
    if (actual.referenced_table !== expected.referencedTable) {
      errors.push(
        `Composite FK ${expected.name}: referenced table is ${actual.referenced_table}, expected ${expected.referencedTable}`,
      );
    }
    if (actual.referenced_schema !== expected.referencedSchema) {
      errors.push(
        `Composite FK ${expected.name}: referenced schema is ${actual.referenced_schema}, expected ${expected.referencedSchema}`,
      );
    }
    if (!arraysEqual(actual.columns ?? [], expected.columns)) {
      errors.push(
        `Composite FK ${expected.name}: columns are ${(actual.columns ?? []).join(', ')}, expected ${expected.columns.join(', ')}`,
      );
    }
    if (!arraysEqual(actual.referenced_columns ?? [], expected.referencedColumns)) {
      errors.push(
        `Composite FK ${expected.name}: referenced columns are ${(actual.referenced_columns ?? []).join(', ')}, expected ${expected.referencedColumns.join(', ')}`,
      );
    }
    if (actionName(actual.delete_action) !== expected.onDelete) {
      errors.push(
        `Composite FK ${expected.name}: ON DELETE is ${actionName(actual.delete_action)}, expected ${expected.onDelete}`,
      );
    }
    if (actionName(actual.update_action) !== expected.onUpdate) {
      errors.push(
        `Composite FK ${expected.name}: ON UPDATE is ${actionName(actual.update_action)}, expected ${expected.onUpdate}`,
      );
    }
    if (!actual.validated) {
      errors.push(`Composite FK ${expected.name} must be VALIDATED`);
    }
    if (actual.deferrable || actual.deferred) {
      errors.push(`Composite FK ${expected.name} must not be DEFERRABLE`);
    }
    if (actual.match_type !== 's') {
      errors.push(`Composite FK ${expected.name}: MATCH is ${actual.match_type}, expected SIMPLE`);
    }
  }

  const expectedForeignKeyKeys = new Set(
    COMPOSITE_FOREIGN_KEYS.map((item) => `${item.table}.${item.name}`),
  );
  for (const actual of foreignKeys) {
    const key = `${actual.table_name}.${actual.conname}`;
    if (!expectedForeignKeyKeys.has(key)) {
      errors.push(
        `Unexpected composite foreign key: ${key} -> ${actual.referenced_schema}.${actual.referenced_table}; update the manifest or remove the constraint`,
      );
    }
  }

  const partialIndexes = await client.$queryRaw<PartialIndexRow[]>`
    SELECT
      i.relname AS index_name,
      t.relname AS table_name,
      am.amname AS method,
      x.indisunique,
      x.indisvalid,
      x.indisready,
      x.indnkeyatts,
      x.indnatts,
      pg_get_expr(x.indpred, x.indrelid) AS predicate,
      (
        SELECT array_agg(a.attname ORDER BY k.ord) FILTER (WHERE k.ord <= x.indnkeyatts)
        FROM unnest(x.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
      ) AS key_columns,
      (
        SELECT array_agg(a.attname ORDER BY k.ord) FILTER (WHERE k.ord > x.indnkeyatts)
        FROM unnest(x.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
      ) AS include_columns
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ${SCHEMA}
      AND x.indpred IS NOT NULL
  `;

  const partialIndexByName = indexRows(
    partialIndexes,
    (row) => row.index_name,
    'partial index',
    errors,
  );

  for (const expected of PARTIAL_UNIQUE_INDEXES) {
    checked += 1;
    const actual = partialIndexByName.get(expected.name);

    if (actual === undefined) {
      errors.push(`Missing partial unique index: ${expected.name} on ${expected.table}`);
      continue;
    }

    if (!actual.indisunique) {
      errors.push(`Partial index ${expected.name} must be UNIQUE`);
    }
    if (!actual.indisvalid) {
      errors.push(`Partial index ${expected.name} is invalid`);
    }
    if (!actual.indisready) {
      errors.push(`Partial index ${expected.name} is not ready`);
    }
    if (actual.method !== expected.method) {
      errors.push(
        `Partial index ${expected.name}: method is ${actual.method}, expected ${expected.method}`,
      );
    }
    if (actual.table_name !== expected.table) {
      errors.push(
        `Partial index ${expected.name}: table is ${actual.table_name}, expected ${expected.table}`,
      );
    }
    if (actual.indnkeyatts !== expected.columns.length) {
      errors.push(
        `Partial index ${expected.name}: key column count is ${actual.indnkeyatts}, expected ${expected.columns.length}`,
      );
    }
    if (actual.indnatts !== expected.columns.length + expected.includeColumns.length) {
      errors.push(
        `Partial index ${expected.name}: total column count is ${actual.indnatts}, expected ${expected.columns.length + expected.includeColumns.length}`,
      );
    }
    if (!arraysEqual(actual.key_columns ?? [], expected.columns)) {
      errors.push(
        `Partial index ${expected.name}: columns are ${(actual.key_columns ?? []).join(', ')}, expected ${expected.columns.join(', ')}`,
      );
    }
    if (!arraysEqual(actual.include_columns ?? [], expected.includeColumns)) {
      errors.push(
        `Partial index ${expected.name}: INCLUDE columns are ${(actual.include_columns ?? []).join(', ')}, expected ${expected.includeColumns.join(', ') || '(none)'}`,
      );
    }
    if (
      actual.predicate === null ||
      normalizeSql(actual.predicate) !== normalizeSql(expected.predicate)
    ) {
      errors.push(
        `Partial index ${expected.name}: predicate is ${actual.predicate ?? 'null'}, expected ${expected.predicate}`,
      );
    }
  }

  const expectedPartialNames = new Set(PARTIAL_UNIQUE_INDEXES.map((item) => item.name));
  for (const actual of partialIndexes) {
    if (!expectedPartialNames.has(actual.index_name)) {
      errors.push(
        `Unexpected partial index: ${actual.index_name} on ${actual.table_name}; update the manifest or remove the duplicate`,
      );
    }
  }

  const trigramIndexes = await client.$queryRaw<TrigramIndexRow[]>`
    SELECT
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
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ${SCHEMA}
      AND pg_get_indexdef(x.indexrelid) LIKE '%gin_trgm_ops%'
  `;

  const trigramIndexByName = indexRows(
    trigramIndexes,
    (row) => row.index_name,
    'trigram index',
    errors,
  );

  for (const expected of TRIGRAM_INDEXES) {
    checked += 1;
    const actual = trigramIndexByName.get(expected.name);

    if (actual === undefined) {
      errors.push(
        `Missing trigram index: ${expected.name} on ${expected.table}.${expected.column}`,
      );
      continue;
    }

    if (actual.table_name !== expected.table) {
      errors.push(
        `Trigram index ${expected.name}: table is ${actual.table_name}, expected ${expected.table}`,
      );
    }
    if (actual.method !== expected.method) {
      errors.push(
        `Trigram index ${expected.name}: method is ${actual.method}, expected ${expected.method}`,
      );
    }
    if (actual.indisunique) {
      errors.push(`Trigram index ${expected.name} must not be UNIQUE`);
    }
    if (!actual.indisvalid) {
      errors.push(`Trigram index ${expected.name} is invalid`);
    }
    if (!actual.indisready) {
      errors.push(`Trigram index ${expected.name} is not ready`);
    }
    if (actual.indnkeyatts !== 1 || actual.indnatts !== 1) {
      errors.push(
        `Trigram index ${expected.name}: expected exactly one key column, got ${actual.indnkeyatts}/${actual.indnatts}`,
      );
    }
    if (normalizeSql(actual.definition) !== normalizeSql(expected.definition)) {
      errors.push(
        `Trigram index ${expected.name}: definition is ${actual.definition}, expected ${expected.definition}`,
      );
    }
  }

  const expectedTrigramNames = new Set(TRIGRAM_INDEXES.map((item) => item.name));
  for (const actual of trigramIndexes) {
    if (!expectedTrigramNames.has(actual.index_name)) {
      errors.push(
        `Unexpected trigram index: ${actual.index_name} on ${actual.table_name}; update the manifest or remove the duplicate`,
      );
    }
  }

  const checkRows = await client.$queryRaw<CheckRow[]>`
    SELECT
      c.conname,
      t.relname AS table_name,
      c.convalidated AS validated,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'c'
      AND n.nspname = ${SCHEMA}
  `;

  const checkByKey = indexRows(
    checkRows,
    (row) => `${row.table_name}.${row.conname}`,
    'CHECK constraint',
    errors,
  );

  for (const expected of CHECK_CONSTRAINTS) {
    checked += 1;
    const actual = checkByKey.get(`${expected.table}.${expected.name}`);

    if (actual === undefined) {
      errors.push(`Missing CHECK constraint: ${expected.name} on ${expected.table}`);
      continue;
    }

    if (actual.table_name !== expected.table) {
      errors.push(
        `CHECK ${expected.name}: table is ${actual.table_name}, expected ${expected.table}`,
      );
    }
    if (!actual.validated) {
      errors.push(`CHECK ${expected.name} must be VALIDATED`);
    }
    if (normalizeSql(actual.definition) !== normalizeSql(expected.definition)) {
      errors.push(
        `CHECK ${expected.name}: definition is ${actual.definition}, expected ${expected.definition}`,
      );
    }
  }

  const expectedCheckKeys = new Set(CHECK_CONSTRAINTS.map((item) => `${item.table}.${item.name}`));
  for (const actual of checkRows) {
    const key = `${actual.table_name}.${actual.conname}`;
    if (!expectedCheckKeys.has(key)) {
      errors.push(
        `Unexpected CHECK constraint: ${key}; update the manifest or remove the constraint`,
      );
    }
  }

  const uniqueRows = await client.$queryRaw<UniqueConstraintRow[]>`
    SELECT
      c.conname,
      t.relname AS table_name,
      (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) AS columns,
      c.convalidated AS validated,
      c.condeferrable AS deferrable,
      c.condeferred AS deferred,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'u'
      AND n.nspname = ${SCHEMA}
  `;

  const uniqueByKey = indexRows(
    uniqueRows,
    (row) => `${row.table_name}.${row.conname}`,
    'unique constraint',
    errors,
  );

  for (const expected of UNIQUE_CONSTRAINTS) {
    checked += 1;
    const actual = uniqueByKey.get(`${expected.table}.${expected.name}`);

    if (actual === undefined) {
      errors.push(`Missing unique constraint: ${expected.name} on ${expected.table}`);
      continue;
    }

    if (actual.table_name !== expected.table) {
      errors.push(
        `Unique constraint ${expected.name}: table is ${actual.table_name}, expected ${expected.table}`,
      );
    }
    if (!arraysEqual(actual.columns ?? [], expected.columns)) {
      errors.push(
        `Unique constraint ${expected.name}: columns are ${(actual.columns ?? []).join(', ')}, expected ${expected.columns.join(', ')}`,
      );
    }
    if (!actual.validated) {
      errors.push(`Unique constraint ${expected.name} must be VALIDATED`);
    }
    if (actual.deferrable || actual.deferred) {
      errors.push(`Unique constraint ${expected.name} must not be DEFERRABLE`);
    }
    if (normalizeSql(actual.definition) !== normalizeSql(expected.definition)) {
      errors.push(
        `Unique constraint ${expected.name}: definition is ${actual.definition}, expected ${expected.definition}`,
      );
    }
  }

  const expectedUniqueKeys = new Set(
    UNIQUE_CONSTRAINTS.map((item) => `${item.table}.${item.name}`),
  );
  for (const actual of uniqueRows) {
    const key = `${actual.table_name}.${actual.conname}`;
    if (!expectedUniqueKeys.has(key)) {
      errors.push(
        `Unexpected unique constraint: ${key}; update the manifest or remove the constraint`,
      );
    }
  }

  const triggerRows = await client.$queryRaw<TriggerRow[]>`
    SELECT
      tg.tgname,
      t.relname AS table_name,
      pn.nspname AS function_schema,
      p.proname AS function_name,
      tg.tgenabled::text AS tgenabled,
      tg.tgtype::int AS tgtype,
      tg.tgqual IS NOT NULL AS has_when_clause,
      tg.tgnargs AS nargs,
      tg.tgdeferrable AS deferrable,
      tg.tginitdeferred AS initially_deferred
    FROM pg_trigger tg
    JOIN pg_class t ON t.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT tg.tgisinternal
      AND n.nspname = ${SCHEMA}
  `;

  const triggerByKey = indexRows(
    triggerRows,
    (row) => `${row.table_name}.${row.tgname}`,
    'trigger',
    errors,
  );

  for (const expected of TRIGGERS) {
    checked += 1;
    const actual = triggerByKey.get(`${expected.table}.${expected.name}`);

    if (actual === undefined) {
      errors.push(`Missing trigger: ${expected.name} on ${expected.table}`);
      continue;
    }

    if (actual.function_schema !== expected.functionSchema) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: function schema is ${actual.function_schema}, expected ${expected.functionSchema}`,
      );
    }
    if (actual.function_name !== expected.functionName) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: function is ${actual.function_name}, expected ${expected.functionName}`,
      );
    }
    if (actual.tgenabled !== 'O') {
      errors.push(`Trigger ${expected.name} on ${expected.table} is not enabled`);
    }
    const level = (actual.tgtype & 1) !== 0 ? 'ROW' : 'STATEMENT';
    if (level !== expected.level) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: level is ${level}, expected ${expected.level}`,
      );
    }
    const isBefore = (actual.tgtype & 2) !== 0;
    if (isBefore !== (expected.timing === 'BEFORE')) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: timing is not ${expected.timing}`,
      );
    }
    const expectedOperations = [...expected.operations].sort();
    if (!arraysEqual(sortedOperations(actual), expectedOperations)) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: operations are ${sortedOperations(actual).join(', ')}, expected ${expectedOperations.join(', ')}`,
      );
    }
    if (actual.has_when_clause) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: WHEN clause is not expected on an integrity trigger`,
      );
    }
    if (actual.nargs !== 0) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: function arguments are not expected, got ${actual.nargs}`,
      );
    }
    if (actual.deferrable || actual.initially_deferred) {
      errors.push(
        `Trigger ${expected.name} on ${expected.table}: constraint trigger semantics are not expected`,
      );
    }
  }

  const expectedTriggerKeys = new Set(TRIGGERS.map((item) => `${item.table}.${item.name}`));
  for (const actual of triggerRows) {
    const key = `${actual.table_name}.${actual.tgname}`;
    if (!expectedTriggerKeys.has(key)) {
      errors.push(
        `Unexpected trigger: ${key} using ${actual.function_schema}.${actual.function_name}; update the manifest or remove the trigger`,
      );
    }
  }

  const functionRows = await client.$queryRaw<FunctionRow[]>`
    SELECT
      p.proname,
      n.nspname AS schema_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_result(p.oid) AS result,
      l.lanname AS language,
      p.prosecdef AS security_definer,
      p.provolatile::text AS volatility,
      COALESCE(p.proconfig, ARRAY[]::text[]) AS configuration,
      md5(regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g')) AS definition_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = ${SCHEMA}
      AND p.prokind = 'f'
      AND p.proname IN (${Prisma.join(TRIGGER_FUNCTIONS.map((item) => item.name))})
  `;

  const functionByKey = indexRows(functionRows, (row) => functionKey(row), 'function', errors);

  for (const expected of TRIGGER_FUNCTIONS) {
    checked += 1;
    const key = `${expected.schema}.${expected.name}(${expected.identityArguments})`;
    const actual = functionByKey.get(key);

    if (actual === undefined) {
      errors.push(`Missing trigger function: ${key}`);
      continue;
    }

    if (actual.result !== expected.returnType) {
      errors.push(
        `Function ${key}: return type is ${actual.result}, expected ${expected.returnType}`,
      );
    }
    if (actual.language !== expected.language) {
      errors.push(`Function ${key}: language is ${actual.language}, expected ${expected.language}`);
    }
    if (actual.security_definer !== expected.securityDefiner) {
      errors.push(
        `Function ${key}: SECURITY DEFINER is ${actual.security_definer}, expected ${expected.securityDefiner}`,
      );
    }
    if (actual.volatility !== expected.volatility) {
      errors.push(
        `Function ${key}: volatility is ${actual.volatility}, expected ${expected.volatility}`,
      );
    }
    if (!arraysEqual(actual.configuration, expected.configuration)) {
      errors.push(
        `Function ${key}: configuration is ${actual.configuration.join(', ') || '(none)'}, expected ${expected.configuration.join(', ') || '(none)'}`,
      );
    }
    if (actual.definition_md5 !== expected.definitionMd5) {
      errors.push(
        `Function ${key}: definition hash is ${actual.definition_md5}, expected ${expected.definitionMd5}`,
      );
    }
  }

  const expectedFunctionKeys = new Set(
    TRIGGER_FUNCTIONS.map((item) => `${item.schema}.${item.name}(${item.identityArguments})`),
  );
  const expectedFunctionNames = new Set(TRIGGER_FUNCTIONS.map((item) => item.name));

  for (const actual of functionRows) {
    if (
      expectedFunctionNames.has(actual.proname) &&
      !expectedFunctionKeys.has(functionKey(actual))
    ) {
      errors.push(`Unexpected overload of trigger function: ${functionKey(actual)}`);
    }
  }

  const triggerFunctionRows = await client.$queryRaw<Array<{ function_name: string }>>`
    SELECT p.proname AS function_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ${SCHEMA}
      AND p.prokind = 'f'
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  `;
  for (const actual of triggerFunctionRows) {
    if (!expectedFunctionNames.has(actual.function_name)) {
      errors.push(
        `Unexpected trigger-returning function: ${SCHEMA}.${actual.function_name}; update the manifest or remove the function`,
      );
    }
  }

  for (const required of REQUIRED_NOT_NULL_COLUMNS) {
    checked += 1;
    const rows = await client.$queryRaw<NotNullRow[]>`
      SELECT a.attnotnull
      FROM pg_attribute a
      JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = ${SCHEMA}
        AND t.relname = ${required.table}
        AND a.attname = ${required.column}
        AND NOT a.attisdropped
    `;
    const actual = rows[0];

    if (actual === undefined) {
      errors.push(`Missing column: ${required.table}.${required.column}`);
    } else if (!actual.attnotnull) {
      errors.push(`Column ${required.table}.${required.column} must be NOT NULL`);
    }
  }

  const roleRows = await client.$queryRaw<RoleRow[]>`
    SELECT
      rolname,
      rolcanlogin,
      rolsuper,
      rolcreatedb,
      rolcreaterole,
      rolreplication,
      rolbypassrls
    FROM pg_roles
    WHERE rolname = ${RUNTIME_GROUP_ROLE}
  `;
  const role = roleRows[0];

  checked += 1;

  if (role === undefined) {
    errors.push(`Missing runtime group role: ${RUNTIME_GROUP_ROLE}`);
  } else {
    if (role.rolcanlogin) {
      errors.push(`Runtime group role ${RUNTIME_GROUP_ROLE} must not have LOGIN`);
    }
    if (role.rolsuper) {
      errors.push(`Runtime group role ${RUNTIME_GROUP_ROLE} must not be SUPERUSER`);
    }
    if (role.rolcreatedb) {
      errors.push(`Runtime group role ${RUNTIME_GROUP_ROLE} must not have CREATEDB`);
    }
    if (role.rolcreaterole) {
      errors.push(`Runtime group role ${RUNTIME_GROUP_ROLE} must not have CREATEROLE`);
    }
    if (role.rolreplication) {
      errors.push(`Runtime group role ${RUNTIME_GROUP_ROLE} must not have REPLICATION`);
    }
    if (role.rolbypassrls) {
      errors.push(`Runtime group role ${RUNTIME_GROUP_ROLE} must not have BYPASSRLS`);
    }

    const schemaRows = await client.$queryRaw<SchemaPrivilegeRow[]>`
      SELECT
        has_schema_privilege(${RUNTIME_GROUP_ROLE}, ${SCHEMA}, 'USAGE') AS can_use,
        has_schema_privilege(${RUNTIME_GROUP_ROLE}, ${SCHEMA}, 'CREATE') AS can_create
    `;
    const schemaPrivileges = schemaRows[0];

    checked += 1;

    if (schemaPrivileges === undefined) {
      errors.push(`Unable to read schema privileges for ${RUNTIME_GROUP_ROLE}`);
    } else {
      if (!schemaPrivileges.can_use) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must have USAGE on schema ${SCHEMA}`);
      }
      if (schemaPrivileges.can_create) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must not have CREATE on schema ${SCHEMA}`);
      }
    }

    const membershipRows = await client.$queryRaw<RoleMembershipRow[]>`
      SELECT granted.rolname AS role_name
      FROM pg_auth_members memberships
      JOIN pg_roles member ON member.oid = memberships.member
      JOIN pg_roles granted ON granted.oid = memberships.roleid
      WHERE member.rolname = ${RUNTIME_GROUP_ROLE}
        AND granted.rolname <> ${RUNTIME_GROUP_ROLE}
    `;

    checked += 1;

    if (membershipRows.length > 0) {
      errors.push(
        `Runtime group role ${RUNTIME_GROUP_ROLE} must not be a member of other roles: ${membershipRows.map((row) => row.role_name).join(', ')}`,
      );
    }
  }

  const ownerRows = await client.$queryRaw<TableOwnerRow[]>`
    SELECT
      t.relname AS table_name,
      pg_get_userbyid(t.relowner) AS owner
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ${SCHEMA}
      AND t.relkind = 'r'
  `;
  const ownerByTable = new Map(ownerRows.map((row) => [row.table_name, row.owner]));
  const businessOwners = new Set<string>();

  for (const table of ALL_TABLES) {
    checked += 1;
    const owner = ownerByTable.get(table);

    if (owner === undefined) {
      errors.push(`Missing business table: ${table}`);
      continue;
    }
    businessOwners.add(owner);
    if (owner === RUNTIME_GROUP_ROLE) {
      errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must not own table ${table}`);
    }
  }

  checked += 1;

  if (businessOwners.size > 1) {
    errors.push(
      `Business tables have inconsistent owners: ${[...businessOwners].sort().join(', ')}`,
    );
  }

  const expectedTableNames = new Set([...ALL_TABLES, '_prisma_migrations']);
  for (const row of ownerRows) {
    if (!expectedTableNames.has(row.table_name)) {
      errors.push(
        `Unexpected public table: ${row.table_name}; add it to the manifest, grants and tests or remove it`,
      );
    }
  }

  if (role !== undefined) {
    for (const table of ALL_TABLES) {
      if (!ownerByTable.has(table)) {
        continue;
      }

      checked += 1;
      const rows = await client.$queryRaw<TablePrivilegeRow[]>`
        SELECT
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'SELECT') AS can_select,
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'INSERT') AS can_insert,
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'UPDATE') AS can_update,
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'DELETE') AS can_delete,
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'TRUNCATE') AS can_truncate,
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'REFERENCES') AS can_references,
          has_table_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${table}`}, 'TRIGGER') AS can_trigger
      `;
      const privileges = rows[0];

      if (privileges === undefined) {
        errors.push(`Unable to read privileges for ${RUNTIME_GROUP_ROLE} on ${table}`);
        continue;
      }

      if (!privileges.can_select) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must have SELECT on ${table}`);
      }
      if (!privileges.can_insert) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must have INSERT on ${table}`);
      }

      const immutable = IMMUTABLE_TABLES.includes(table);
      const canUpdate = !immutable;
      const canDelete = !immutable;

      if (privileges.can_update !== canUpdate) {
        errors.push(
          `Runtime role ${RUNTIME_GROUP_ROLE} UPDATE on ${table} is ${privileges.can_update}, expected ${canUpdate}`,
        );
      }
      if (privileges.can_delete !== canDelete) {
        errors.push(
          `Runtime role ${RUNTIME_GROUP_ROLE} DELETE on ${table} is ${privileges.can_delete}, expected ${canDelete}`,
        );
      }
      if (privileges.can_truncate) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must not have TRUNCATE on ${table}`);
      }
      if (privileges.can_references) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must not have REFERENCES on ${table}`);
      }
      if (privileges.can_trigger) {
        errors.push(`Runtime role ${RUNTIME_GROUP_ROLE} must not have TRIGGER on ${table}`);
      }
    }

    const sequenceRows = await client.$queryRaw<SequenceRow[]>`
      SELECT c.relname AS sequence_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${SCHEMA}
        AND c.relkind = 'S'
    `;

    for (const sequence of sequenceRows) {
      checked += 1;
      const rows = await client.$queryRaw<SequencePrivilegeRow[]>`
        SELECT
          has_sequence_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${sequence.sequence_name}`}, 'USAGE') AS can_usage,
          has_sequence_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${sequence.sequence_name}`}, 'SELECT') AS can_select,
          has_sequence_privilege(${RUNTIME_GROUP_ROLE}, ${`${SCHEMA}.${sequence.sequence_name}`}, 'UPDATE') AS can_update
      `;
      const privileges = rows[0];

      if (privileges === undefined) {
        errors.push(
          `Unable to read privileges for ${RUNTIME_GROUP_ROLE} on sequence ${sequence.sequence_name}`,
        );
        continue;
      }

      if (privileges.can_usage) {
        errors.push(
          `Runtime role ${RUNTIME_GROUP_ROLE} must not have USAGE on sequence ${sequence.sequence_name}`,
        );
      }
      if (privileges.can_select) {
        errors.push(
          `Runtime role ${RUNTIME_GROUP_ROLE} must not have SELECT on sequence ${sequence.sequence_name}`,
        );
      }
      if (privileges.can_update) {
        errors.push(
          `Runtime role ${RUNTIME_GROUP_ROLE} must not have UPDATE on sequence ${sequence.sequence_name}`,
        );
      }
    }
  }

  return { errors, checked };
}
