import { describe, expect, it } from 'vitest';
import {
  ALL_TABLES,
  CHECK_CONSTRAINTS,
  COMPOSITE_FOREIGN_KEYS,
  IMMUTABLE_TABLES,
  MUTABLE_TABLES,
  PARTIAL_UNIQUE_INDEXES,
  PROTECTED_OBJECTS,
  REPLACED_OBJECTS,
  REQUIRED_NOT_NULL_COLUMNS,
  RUNTIME_GROUP_ROLE,
  TRIGGERS,
  TRIGGER_FUNCTIONS,
  TRIGGER_FUNCTION_NAMES,
  TRIGRAM_INDEXES,
  UNIQUE_CONSTRAINTS,
  UPDATED_AT_TABLES,
} from '../../../src/database/integrity-manifest.js';

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }

  return [...repeated];
}

describe('integrity manifest', () => {
  it('declares the expected catalog counts', () => {
    expect(ALL_TABLES).toHaveLength(20);
    expect(IMMUTABLE_TABLES).toHaveLength(3);
    expect(MUTABLE_TABLES).toHaveLength(17);
    expect(UPDATED_AT_TABLES).toHaveLength(14);
    expect(PARTIAL_UNIQUE_INDEXES).toHaveLength(6);
    expect(TRIGRAM_INDEXES).toHaveLength(5);
    expect(CHECK_CONSTRAINTS).toHaveLength(25);
    expect(UNIQUE_CONSTRAINTS).toHaveLength(5);
    expect(COMPOSITE_FOREIGN_KEYS).toHaveLength(19);
    expect(TRIGGER_FUNCTIONS).toHaveLength(3);
    expect(TRIGGERS).toHaveLength(18);
    expect(REPLACED_OBJECTS).toHaveLength(5);
    expect(RUNTIME_GROUP_ROLE).toBe('eventpulse_app');
  });

  it('declares the exact table catalog and immutability split', () => {
    expect([...ALL_TABLES].sort()).toEqual(
      [
        'api_keys',
        'audit_logs',
        'booth_reservations',
        'booths',
        'check_ins',
        'events',
        'exhibitors',
        'exports',
        'imports',
        'invitations',
        'memberships',
        'organizations',
        'participants',
        'password_reset_tokens',
        'refunds',
        'registrations',
        'sessions',
        'tickets',
        'transactions',
        'users',
      ].sort(),
    );
    expect([...IMMUTABLE_TABLES].sort()).toEqual(['audit_logs', 'check_ins', 'refunds']);
    expect([...UPDATED_AT_TABLES].sort()).toEqual(
      [
        'api_keys',
        'booth_reservations',
        'booths',
        'events',
        'exhibitors',
        'exports',
        'imports',
        'memberships',
        'organizations',
        'participants',
        'registrations',
        'tickets',
        'transactions',
        'users',
      ].sort(),
    );
  });

  it('maps the exact composite foreign key identities', () => {
    expect(
      COMPOSITE_FOREIGN_KEYS.map((key) => ({
        name: key.name,
        table: key.table,
        columns: key.columns,
        referencedTable: key.referencedTable,
        referencedColumns: key.referencedColumns,
        onDelete: key.onDelete,
        onUpdate: key.onUpdate,
      })),
    ).toEqual([
      {
        name: 'events_manager_org_fk',
        table: 'events',
        columns: ['organization_id', 'manager_membership_id'],
        referencedTable: 'memberships',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'tickets_event_org_fk',
        table: 'tickets',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'registrations_event_org_fk',
        table: 'registrations',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'registrations_participant_org_fk',
        table: 'registrations',
        columns: ['organization_id', 'participant_id'],
        referencedTable: 'participants',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'registrations_ticket_org_event_fk',
        table: 'registrations',
        columns: ['organization_id', 'event_id', 'ticket_id'],
        referencedTable: 'tickets',
        referencedColumns: ['organization_id', 'event_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      },
      {
        name: 'transactions_event_org_fk',
        table: 'transactions',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'transactions_registration_org_event_fk',
        table: 'transactions',
        columns: ['organization_id', 'event_id', 'registration_id'],
        referencedTable: 'registrations',
        referencedColumns: ['organization_id', 'event_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      },
      {
        name: 'transactions_reservation_org_event_fk',
        table: 'transactions',
        columns: ['organization_id', 'event_id', 'booth_reservation_id'],
        referencedTable: 'booth_reservations',
        referencedColumns: ['organization_id', 'event_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      },
      {
        name: 'refunds_transaction_org_fk',
        table: 'refunds',
        columns: ['organization_id', 'transaction_id'],
        referencedTable: 'transactions',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'checkins_event_org_fk',
        table: 'check_ins',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'checkins_participant_org_fk',
        table: 'check_ins',
        columns: ['organization_id', 'participant_id'],
        referencedTable: 'participants',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'checkins_registration_org_event_fk',
        table: 'check_ins',
        columns: ['organization_id', 'event_id', 'registration_id'],
        referencedTable: 'registrations',
        referencedColumns: ['organization_id', 'event_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      },
      {
        name: 'checkins_registration_org_participant_fk',
        table: 'check_ins',
        columns: ['organization_id', 'participant_id', 'registration_id'],
        referencedTable: 'registrations',
        referencedColumns: ['organization_id', 'participant_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      },
      {
        name: 'booths_event_org_fk',
        table: 'booths',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'booth_reservations_event_org_fk',
        table: 'booth_reservations',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'booth_reservations_booth_org_event_fk',
        table: 'booth_reservations',
        columns: ['organization_id', 'event_id', 'booth_id'],
        referencedTable: 'booths',
        referencedColumns: ['organization_id', 'event_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'RESTRICT',
      },
      {
        name: 'booth_reservations_exhibitor_org_fk',
        table: 'booth_reservations',
        columns: ['organization_id', 'exhibitor_id'],
        referencedTable: 'exhibitors',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'imports_event_org_fk',
        table: 'imports',
        columns: ['organization_id', 'event_id'],
        referencedTable: 'events',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      {
        name: 'participants_merge_org_fk',
        table: 'participants',
        columns: ['organization_id', 'merged_into_participant_id'],
        referencedTable: 'participants',
        referencedColumns: ['organization_id', 'id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
    ]);
  });

  it('maps the exact three-column unique constraints', () => {
    expect(
      UNIQUE_CONSTRAINTS.map((constraint) => ({
        name: constraint.name,
        table: constraint.table,
        columns: constraint.columns,
        definition: constraint.definition,
      })),
    ).toEqual([
      {
        name: 'tickets_org_event_id_uq',
        table: 'tickets',
        columns: ['organization_id', 'event_id', 'id'],
        definition: 'UNIQUE (organization_id, event_id, id)',
      },
      {
        name: 'booths_org_event_id_uq',
        table: 'booths',
        columns: ['organization_id', 'event_id', 'id'],
        definition: 'UNIQUE (organization_id, event_id, id)',
      },
      {
        name: 'registrations_org_event_id_uq',
        table: 'registrations',
        columns: ['organization_id', 'event_id', 'id'],
        definition: 'UNIQUE (organization_id, event_id, id)',
      },
      {
        name: 'registrations_org_participant_id_uq',
        table: 'registrations',
        columns: ['organization_id', 'participant_id', 'id'],
        definition: 'UNIQUE (organization_id, participant_id, id)',
      },
      {
        name: 'booth_reservations_org_event_id_uq',
        table: 'booth_reservations',
        columns: ['organization_id', 'event_id', 'id'],
        definition: 'UNIQUE (organization_id, event_id, id)',
      },
    ]);

    for (const constraint of UNIQUE_CONSTRAINTS) {
      expect(constraint.definition).toBe(`UNIQUE (${constraint.columns.join(', ')})`);
    }
  });

  it('maps one updated_at trigger per table, and no other trigger on immutable tables', () => {
    const updatedAtTriggers = TRIGGERS.filter(
      (trigger) => trigger.functionName === 'set_updated_at_if_unchanged',
    );

    expect(updatedAtTriggers.map((trigger) => trigger.table).sort()).toEqual(
      [...UPDATED_AT_TABLES].sort(),
    );
    expect(updatedAtTriggers.every((trigger) => trigger.name === 'trg_touch_updated_at')).toBe(
      true,
    );
    expect(
      updatedAtTriggers.every(
        (trigger) =>
          trigger.timing === 'BEFORE' &&
          trigger.operations.length === 1 &&
          trigger.operations[0] === 'UPDATE',
      ),
    ).toBe(true);

    expect(
      TRIGGERS.filter((trigger) => trigger.functionName === 'prevent_immutable_mutation')
        .map((trigger) => `${trigger.table}.${trigger.name}`)
        .sort(),
    ).toEqual([
      'audit_logs.trg_audit_immutable',
      'check_ins.trg_checkin_immutable',
      'refunds.trg_refund_immutable',
    ]);

    expect(
      TRIGGERS.filter((trigger) => trigger.functionName === 'enforce_refund_cap').map(
        (trigger) => ({
          table: trigger.table,
          name: trigger.name,
          timing: trigger.timing,
          operations: trigger.operations,
        }),
      ),
    ).toEqual([
      { table: 'refunds', name: 'trg_refund_cap', timing: 'BEFORE', operations: ['INSERT'] },
    ]);
  });

  it('maps the exact trigram and partial unique index identities', () => {
    expect(
      TRIGRAM_INDEXES.map((index) => ({
        name: index.name,
        table: index.table,
        column: index.column,
        expression: index.expression,
      })),
    ).toEqual([
      { name: 'participants_first_name_trgm_idx', table: 'participants', column: 'first_name' },
      { name: 'participants_last_name_trgm_idx', table: 'participants', column: 'last_name' },
      {
        name: 'participants_email_trgm_idx',
        table: 'participants',
        column: 'email',
        expression: '(email)::text',
      },
      { name: 'exhibitors_name_trgm_idx', table: 'exhibitors', column: 'name' },
      { name: 'events_name_trgm_idx', table: 'events', column: 'name' },
    ]);

    expect(
      PARTIAL_UNIQUE_INDEXES.map((index) => ({
        name: index.name,
        table: index.table,
        columns: index.columns,
        predicate: index.predicate,
      })),
    ).toEqual([
      {
        name: 'booth_reservations_one_active_uq',
        table: 'booth_reservations',
        columns: ['booth_id'],
        predicate: "(status = 'ACTIVE'::reservation_status)",
      },
      {
        name: 'checkins_valid_unique_uq',
        table: 'check_ins',
        columns: ['organization_id', 'event_id', 'participant_id'],
        predicate: "(status = 'VALID'::check_in_status)",
      },
      {
        name: 'transactions_ticket_registration_uq',
        table: 'transactions',
        columns: ['registration_id'],
        predicate: "(type = 'TICKET'::transaction_type)",
      },
      {
        name: 'transactions_booth_reservation_uq',
        table: 'transactions',
        columns: ['booth_reservation_id'],
        predicate: "(type = 'BOOTH'::transaction_type)",
      },
      {
        name: 'booths_org_event_code_uq',
        table: 'booths',
        columns: ['organization_id', 'event_id', 'code'],
        predicate: '(deleted_at IS NULL)',
      },
      {
        name: 'invitations_pending_email_uq',
        table: 'invitations',
        columns: ['organization_id', 'email'],
        predicate: "(status = 'PENDING'::invitation_status)",
      },
    ]);
  });

  it('declares the exact trigger function identities and configuration', () => {
    expect(TRIGGER_FUNCTIONS.map((fn) => fn.name)).toEqual([
      'enforce_refund_cap',
      'prevent_immutable_mutation',
      'set_updated_at_if_unchanged',
    ]);

    const refundCap = TRIGGER_FUNCTIONS.find((fn) => fn.name === 'enforce_refund_cap');
    expect(refundCap?.configuration).toEqual(['search_path=pg_catalog, public']);

    for (const fn of TRIGGER_FUNCTIONS) {
      expect(fn.configuration).toEqual(
        fn.name === 'enforce_refund_cap' ? ['search_path=pg_catalog, public'] : [],
      );
    }
  });

  it('does not declare duplicate names inside a catalog family', () => {
    expect(duplicates(ALL_TABLES)).toEqual([]);
    expect(duplicates(IMMUTABLE_TABLES)).toEqual([]);
    expect(duplicates(UPDATED_AT_TABLES)).toEqual([]);
    expect(duplicates(PARTIAL_UNIQUE_INDEXES.map((item) => item.name))).toEqual([]);
    expect(duplicates(TRIGRAM_INDEXES.map((item) => item.name))).toEqual([]);
    expect(duplicates(CHECK_CONSTRAINTS.map((item) => item.name))).toEqual([]);
    expect(duplicates(UNIQUE_CONSTRAINTS.map((item) => item.name))).toEqual([]);
    expect(duplicates(COMPOSITE_FOREIGN_KEYS.map((item) => item.name))).toEqual([]);
    expect(duplicates(TRIGGER_FUNCTION_NAMES)).toEqual([]);
    expect(duplicates(TRIGGERS.map((item) => `${item.table}.${item.name}`))).toEqual([]);
    expect(duplicates(REPLACED_OBJECTS.map((item) => item.name))).toEqual([]);
  });

  it('keeps mutable and immutable table sets disjoint and complete', () => {
    expect(MUTABLE_TABLES.some((table) => IMMUTABLE_TABLES.includes(table))).toBe(false);
    expect([...MUTABLE_TABLES, ...IMMUTABLE_TABLES].sort()).toEqual([...ALL_TABLES].sort());
    expect(UPDATED_AT_TABLES.every((table) => MUTABLE_TABLES.includes(table))).toBe(true);
  });

  it('declares trigger tables that all exist in the catalog', () => {
    for (const trigger of TRIGGERS) {
      expect(ALL_TABLES).toContain(trigger.table);
      expect(trigger.level).toBe('ROW');
      expect(trigger.functionSchema).toBe('public');
      expect(TRIGGER_FUNCTION_NAMES).toContain(trigger.functionName);
    }

    const immutableUpdatedAtTriggers = TRIGGERS.filter(
      (trigger) =>
        IMMUTABLE_TABLES.includes(trigger.table) &&
        trigger.functionName === 'set_updated_at_if_unchanged',
    );

    expect(immutableUpdatedAtTriggers).toEqual([]);
  });

  it('declares validated, non-deferrable, simple composite foreign keys', () => {
    for (const foreignKey of COMPOSITE_FOREIGN_KEYS) {
      expect(foreignKey.columns).toHaveLength(foreignKey.referencedColumns.length);
      expect(foreignKey.columns.length).toBeGreaterThanOrEqual(2);
      expect(foreignKey.referencedSchema).toBe('public');
      expect(foreignKey.validated).toBe(true);
      expect(foreignKey.matchType).toBe('SIMPLE');
      expect(foreignKey.deferrable).toBe(false);
      expect(foreignKey.deferred).toBe(false);
    }
  });

  it('declares validated, non-deferrable unique constraints', () => {
    for (const constraint of UNIQUE_CONSTRAINTS) {
      expect(constraint.columns.length).toBeGreaterThanOrEqual(2);
      expect(constraint.validated).toBe(true);
      expect(constraint.deferrable).toBe(false);
      expect(constraint.deferred).toBe(false);
    }
  });

  it('declares exact check, partial-index and trigram definitions', () => {
    for (const constraint of CHECK_CONSTRAINTS) {
      expect(constraint.definition.startsWith('CHECK (')).toBe(true);
      expect(constraint.definition.length).toBeGreaterThan('CHECK ('.length);
      expect(ALL_TABLES).toContain(constraint.table);
    }

    for (const index of PARTIAL_UNIQUE_INDEXES) {
      expect(index.method).toBe('btree');
      expect(index.includeColumns).toEqual([]);
      expect(index.predicate.startsWith('(')).toBe(true);
      expect(ALL_TABLES).toContain(index.table);
    }

    for (const index of TRIGRAM_INDEXES) {
      expect(index.method).toBe('gin');
      expect(index.definition).toContain('USING gin');
      expect(index.definition).toContain('gin_trgm_ops');
      expect(ALL_TABLES).toContain(index.table);
    }
  });

  it('declares complete trigger function identities', () => {
    for (const fn of TRIGGER_FUNCTIONS) {
      expect(fn.schema).toBe('public');
      expect(fn.identityArguments).toBe('');
      expect(fn.returnType).toBe('trigger');
      expect(fn.language).toBe('plpgsql');
      expect(fn.securityDefiner).toBe(false);
      expect(fn.definitionMd5).toMatch(/^[a-f0-9]{32}$/);
    }
  });

  it('maps each replaced object to existing replacements', () => {
    const constraintNames = new Set(COMPOSITE_FOREIGN_KEYS.map((item) => item.name));

    for (const replaced of REPLACED_OBJECTS) {
      expect(replaced.type).toBe('constraint');
      expect(replaced.justification.length).toBeGreaterThan(20);
      expect(replaced.migration).toMatch(/^\d{14}_[a-z0-9_]+$/);
      expect(replaced.replacedBy.length).toBeGreaterThan(0);
      expect(replaced.replacedBy.every((name) => constraintNames.has(name))).toBe(true);
    }
  });

  it('protects every declared object with the exact typed set', () => {
    expect(ALL_TABLES.filter((name) => !PROTECTED_OBJECTS.tables.has(name))).toEqual([]);
    expect(PROTECTED_OBJECTS.tables.has('_prisma_migrations')).toBe(true);

    for (const name of [
      ...COMPOSITE_FOREIGN_KEYS.map((item) => item.name),
      ...CHECK_CONSTRAINTS.map((item) => item.name),
      ...UNIQUE_CONSTRAINTS.map((item) => item.name),
      ...REPLACED_OBJECTS.map((item) => item.name),
    ]) {
      expect(PROTECTED_OBJECTS.constraints.has(name)).toBe(true);
    }

    expect(
      PARTIAL_UNIQUE_INDEXES.filter((item) => !PROTECTED_OBJECTS.indexes.has(item.name)),
    ).toEqual([]);
    expect(TRIGRAM_INDEXES.filter((item) => !PROTECTED_OBJECTS.indexes.has(item.name))).toEqual([]);
    // Prisma emits DROP INDEX for unique constraints, so they must be protected
    // under both families.
    expect(UNIQUE_CONSTRAINTS.filter((item) => !PROTECTED_OBJECTS.indexes.has(item.name))).toEqual(
      [],
    );
    expect(TRIGGERS.filter((item) => !PROTECTED_OBJECTS.triggers.has(item.name))).toEqual([]);
    expect(TRIGGER_FUNCTION_NAMES.filter((name) => !PROTECTED_OBJECTS.functions.has(name))).toEqual(
      [],
    );
    expect(PROTECTED_OBJECTS.schemas.has('public')).toBe(true);
    expect(PROTECTED_OBJECTS.extensions.has('pg_trgm')).toBe(true);
    expect(PROTECTED_OBJECTS.roles.has(RUNTIME_GROUP_ROLE)).toBe(true);
  });

  it('requires api_keys.scopes to be not null', () => {
    expect(REQUIRED_NOT_NULL_COLUMNS).toContainEqual({
      table: 'api_keys',
      column: 'scopes',
    });
  });
});
