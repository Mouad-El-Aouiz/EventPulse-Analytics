export type ForeignKeyAction = 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
export type TriggerOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type TriggerTiming = 'BEFORE' | 'AFTER';
export type TriggerLevel = 'ROW' | 'STATEMENT';
export type IndexMethod = 'btree' | 'gin';
export type FunctionVolatility = 'v' | 'i' | 's';

export interface CompositeForeignKey {
  name: string;
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  referencedSchema: 'public';
  onDelete: ForeignKeyAction;
  onUpdate: ForeignKeyAction;
  validated: true;
  matchType: 'SIMPLE';
  deferrable: false;
  deferred: false;
}

export interface PartialUniqueIndex {
  name: string;
  table: string;
  columns: string[];
  includeColumns: string[];
  predicate: string;
  method: 'btree';
}

export interface CheckConstraint {
  name: string;
  table: string;
  definition: string;
}

export interface UniqueConstraint {
  name: string;
  table: string;
  columns: string[];
  definition: string;
  validated: true;
  deferrable: false;
  deferred: false;
}

export interface TriggerDefinition {
  name: string;
  table: string;
  functionName: string;
  functionSchema: 'public';
  timing: TriggerTiming;
  level: TriggerLevel;
  operations: TriggerOperation[];
}

export interface TrigramIndex {
  name: string;
  table: string;
  column: string;
  expression?: string;
  definition: string;
  method: 'gin';
}

export interface TriggerFunctionDefinition {
  name: string;
  schema: 'public';
  identityArguments: '';
  returnType: 'trigger';
  language: 'plpgsql';
  securityDefiner: false;
  volatility: FunctionVolatility;
  configuration: string[];
  definitionMd5: string;
}

export interface ReplacedObject {
  type: 'constraint';
  name: string;
  replacedBy: string[];
  justification: string;
  migration: string;
}

export interface ProtectedObjects {
  tables: ReadonlySet<string>;
  constraints: ReadonlySet<string>;
  indexes: ReadonlySet<string>;
  triggers: ReadonlySet<string>;
  functions: ReadonlySet<string>;
  schemas: ReadonlySet<string>;
  extensions: ReadonlySet<string>;
  roles: ReadonlySet<string>;
}

export const SCHEMA_NAME = 'public';
export const RUNTIME_GROUP_ROLE = 'eventpulse_app';

export const ALL_TABLES: string[] = [
  'users',
  'sessions',
  'password_reset_tokens',
  'organizations',
  'memberships',
  'invitations',
  'api_keys',
  'events',
  'tickets',
  'participants',
  'registrations',
  'transactions',
  'refunds',
  'check_ins',
  'exhibitors',
  'booths',
  'booth_reservations',
  'imports',
  'exports',
  'audit_logs',
];

export const IMMUTABLE_TABLES: string[] = ['check_ins', 'refunds', 'audit_logs'];

export const MUTABLE_TABLES: string[] = ALL_TABLES.filter(
  (table) => !IMMUTABLE_TABLES.includes(table),
);

export const UPDATED_AT_TABLES: string[] = [
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
];

export const PARTIAL_UNIQUE_INDEXES: PartialUniqueIndex[] = [
  {
    name: 'booth_reservations_one_active_uq',
    table: 'booth_reservations',
    columns: ['booth_id'],
    includeColumns: [],
    predicate: "(status = 'ACTIVE'::reservation_status)",
    method: 'btree',
  },
  {
    name: 'checkins_valid_unique_uq',
    table: 'check_ins',
    columns: ['organization_id', 'event_id', 'participant_id'],
    includeColumns: [],
    predicate: "(status = 'VALID'::check_in_status)",
    method: 'btree',
  },
  {
    name: 'transactions_ticket_registration_uq',
    table: 'transactions',
    columns: ['registration_id'],
    includeColumns: [],
    predicate: "(type = 'TICKET'::transaction_type)",
    method: 'btree',
  },
  {
    name: 'transactions_booth_reservation_uq',
    table: 'transactions',
    columns: ['booth_reservation_id'],
    includeColumns: [],
    predicate: "(type = 'BOOTH'::transaction_type)",
    method: 'btree',
  },
  {
    name: 'booths_org_event_code_uq',
    table: 'booths',
    columns: ['organization_id', 'event_id', 'code'],
    includeColumns: [],
    predicate: '(deleted_at IS NULL)',
    method: 'btree',
  },
  {
    name: 'invitations_pending_email_uq',
    table: 'invitations',
    columns: ['organization_id', 'email'],
    includeColumns: [],
    predicate: "(status = 'PENDING'::invitation_status)",
    method: 'btree',
  },
];

export const REPLACED_OBJECTS: ReplacedObject[] = [
  {
    type: 'constraint',
    name: 'registrations_ticket_org_fk',
    replacedBy: ['registrations_ticket_org_event_fk'],
    justification: 'Remplacee par une FK 3 colonnes garantissant la coherence billet/evenement.',
    migration: '20261122101000_event_integrity_constraints',
  },
  {
    type: 'constraint',
    name: 'booth_reservations_booth_org_fk',
    replacedBy: ['booth_reservations_booth_org_event_fk'],
    justification: 'Remplacee par une FK 3 colonnes garantissant la coherence stand/evenement.',
    migration: '20261122101000_event_integrity_constraints',
  },
  {
    type: 'constraint',
    name: 'transactions_registration_org_fk',
    replacedBy: ['transactions_registration_org_event_fk'],
    justification:
      'Remplacee par une FK 3 colonnes garantissant la coherence inscription/evenement.',
    migration: '20261122101000_event_integrity_constraints',
  },
  {
    type: 'constraint',
    name: 'transactions_reservation_org_fk',
    replacedBy: ['transactions_reservation_org_event_fk'],
    justification:
      'Remplacee par une FK 3 colonnes garantissant la coherence reservation/evenement.',
    migration: '20261122101000_event_integrity_constraints',
  },
  {
    type: 'constraint',
    name: 'checkins_registration_org_fk',
    replacedBy: ['checkins_registration_org_event_fk', 'checkins_registration_org_participant_fk'],
    justification:
      'Remplacee par deux FK 3 colonnes garantissant la coherence inscription/evenement et inscription/participant.',
    migration: '20261122101000_event_integrity_constraints',
  },
];

export const TRIGRAM_INDEXES: TrigramIndex[] = [
  {
    name: 'participants_first_name_trgm_idx',
    table: 'participants',
    column: 'first_name',
    definition:
      'CREATE INDEX participants_first_name_trgm_idx ON public.participants USING gin (first_name gin_trgm_ops)',
    method: 'gin',
  },
  {
    name: 'participants_last_name_trgm_idx',
    table: 'participants',
    column: 'last_name',
    definition:
      'CREATE INDEX participants_last_name_trgm_idx ON public.participants USING gin (last_name gin_trgm_ops)',
    method: 'gin',
  },
  {
    name: 'participants_email_trgm_idx',
    table: 'participants',
    column: 'email',
    expression: '(email)::text',
    definition:
      'CREATE INDEX participants_email_trgm_idx ON public.participants USING gin (((email)::text) gin_trgm_ops)',
    method: 'gin',
  },
  {
    name: 'exhibitors_name_trgm_idx',
    table: 'exhibitors',
    column: 'name',
    definition:
      'CREATE INDEX exhibitors_name_trgm_idx ON public.exhibitors USING gin (name gin_trgm_ops)',
    method: 'gin',
  },
  {
    name: 'events_name_trgm_idx',
    table: 'events',
    column: 'name',
    definition: 'CREATE INDEX events_name_trgm_idx ON public.events USING gin (name gin_trgm_ops)',
    method: 'gin',
  },
];

export const CHECK_CONSTRAINTS: CheckConstraint[] = [
  {
    name: 'api_keys_scopes_chk',
    table: 'api_keys',
    definition: "CHECK ((scopes <@ ARRAY['ingestion:write'::text]))",
  },
  {
    name: 'audit_logs_metadata_size_chk',
    table: 'audit_logs',
    definition: 'CHECK ((pg_column_size(metadata) <= 8192))',
  },
  {
    name: 'booth_reservations_currency_chk',
    table: 'booth_reservations',
    definition: "CHECK ((currency = 'EUR'::bpchar))",
  },
  {
    name: 'booth_reservations_price_chk',
    table: 'booth_reservations',
    definition: 'CHECK ((price_amount >= (0)::numeric))',
  },
  {
    name: 'booth_reservations_status_released_chk',
    table: 'booth_reservations',
    definition:
      "CHECK ((((status = 'ACTIVE'::reservation_status) AND (released_at IS NULL)) OR ((status = 'RELEASED'::reservation_status) AND (released_at IS NOT NULL))))",
  },
  {
    name: 'booths_area_chk',
    table: 'booths',
    definition: 'CHECK ((area_sqm >= (0)::numeric))',
  },
  {
    name: 'booths_currency_chk',
    table: 'booths',
    definition: "CHECK ((currency = 'EUR'::bpchar))",
  },
  {
    name: 'booths_price_chk',
    table: 'booths',
    definition: 'CHECK ((price_amount >= (0)::numeric))',
  },
  {
    name: 'check_ins_status_reason_chk',
    table: 'check_ins',
    definition:
      "CHECK ((((status = 'VALID'::check_in_status) AND (reason IS NULL) AND (event_id IS NOT NULL) AND (participant_id IS NOT NULL) AND (registration_id IS NOT NULL)) OR ((status = 'INVALID'::check_in_status) AND (reason IS NOT NULL))))",
  },
  {
    name: 'events_check_in_offsets_chk',
    table: 'events',
    definition: 'CHECK ((check_in_opens_offset_minutes <= check_in_closes_offset_minutes))',
  },
  {
    name: 'events_period_chk',
    table: 'events',
    definition: 'CHECK ((end_at > start_at))',
  },
  {
    name: 'exports_file_size_chk',
    table: 'exports',
    definition: 'CHECK (((file_size_bytes IS NULL) OR (file_size_bytes >= 0)))',
  },
  {
    name: 'imports_counters_chk',
    table: 'imports',
    definition:
      'CHECK (((total_rows >= 0) AND (processed_rows >= 0) AND (success_rows >= 0) AND (error_rows >= 0)))',
  },
  {
    name: 'organizations_currency_chk',
    table: 'organizations',
    definition: "CHECK ((currency = 'EUR'::bpchar))",
  },
  {
    name: 'organizations_export_retention_chk',
    table: 'organizations',
    definition: 'CHECK (((export_retention_days >= 1) AND (export_retention_days <= 365)))',
  },
  {
    name: 'participants_birth_year_chk',
    table: 'participants',
    definition: 'CHECK (((birth_year >= 1900) AND (birth_year <= 2100)))',
  },
  {
    name: 'participants_merge_not_self_chk',
    table: 'participants',
    definition:
      'CHECK (((merged_into_participant_id IS NULL) OR (merged_into_participant_id <> id)))',
  },
  {
    name: 'refunds_amount_chk',
    table: 'refunds',
    definition: 'CHECK ((amount > (0)::numeric))',
  },
  {
    name: 'sessions_expiry_within_absolute_chk',
    table: 'sessions',
    definition: 'CHECK ((expires_at <= absolute_expires_at))',
  },
  {
    name: 'refunds_currency_chk',
    table: 'refunds',
    definition: "CHECK ((currency = 'EUR'::bpchar))",
  },
  {
    name: 'tickets_currency_chk',
    table: 'tickets',
    definition: "CHECK ((currency = 'EUR'::bpchar))",
  },
  {
    name: 'tickets_price_chk',
    table: 'tickets',
    definition: 'CHECK ((price_amount >= (0)::numeric))',
  },
  {
    name: 'transactions_amount_chk',
    table: 'transactions',
    definition: 'CHECK ((amount > (0)::numeric))',
  },
  {
    name: 'transactions_currency_chk',
    table: 'transactions',
    definition: "CHECK ((currency = 'EUR'::bpchar))",
  },
  {
    name: 'transactions_paid_at_chk',
    table: 'transactions',
    definition:
      "CHECK (((status = ANY (ARRAY['PAID'::transaction_status, 'PARTIALLY_REFUNDED'::transaction_status, 'REFUNDED'::transaction_status])) = (paid_at IS NOT NULL)))",
  },
  {
    name: 'transactions_type_reference_chk',
    table: 'transactions',
    definition:
      "CHECK ((((type = 'TICKET'::transaction_type) AND (registration_id IS NOT NULL) AND (booth_reservation_id IS NULL)) OR ((type = 'BOOTH'::transaction_type) AND (booth_reservation_id IS NOT NULL) AND (registration_id IS NULL))))",
  },
];

export const UNIQUE_CONSTRAINTS: UniqueConstraint[] = [
  {
    name: 'tickets_org_event_id_uq',
    table: 'tickets',
    columns: ['organization_id', 'event_id', 'id'],
    definition: 'UNIQUE (organization_id, event_id, id)',
    validated: true,
    deferrable: false,
    deferred: false,
  },
  {
    name: 'booths_org_event_id_uq',
    table: 'booths',
    columns: ['organization_id', 'event_id', 'id'],
    definition: 'UNIQUE (organization_id, event_id, id)',
    validated: true,
    deferrable: false,
    deferred: false,
  },
  {
    name: 'registrations_org_event_id_uq',
    table: 'registrations',
    columns: ['organization_id', 'event_id', 'id'],
    definition: 'UNIQUE (organization_id, event_id, id)',
    validated: true,
    deferrable: false,
    deferred: false,
  },
  {
    name: 'registrations_org_participant_id_uq',
    table: 'registrations',
    columns: ['organization_id', 'participant_id', 'id'],
    definition: 'UNIQUE (organization_id, participant_id, id)',
    validated: true,
    deferrable: false,
    deferred: false,
  },
  {
    name: 'booth_reservations_org_event_id_uq',
    table: 'booth_reservations',
    columns: ['organization_id', 'event_id', 'id'],
    definition: 'UNIQUE (organization_id, event_id, id)',
    validated: true,
    deferrable: false,
    deferred: false,
  },
];

function compositeForeignKey(
  key: Omit<
    CompositeForeignKey,
    'referencedSchema' | 'validated' | 'matchType' | 'deferrable' | 'deferred'
  >,
): CompositeForeignKey {
  return {
    ...key,
    referencedSchema: 'public',
    validated: true,
    matchType: 'SIMPLE',
    deferrable: false,
    deferred: false,
  };
}

export const COMPOSITE_FOREIGN_KEYS: CompositeForeignKey[] = [
  compositeForeignKey({
    name: 'events_manager_org_fk',
    table: 'events',
    columns: ['organization_id', 'manager_membership_id'],
    referencedTable: 'memberships',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'tickets_event_org_fk',
    table: 'tickets',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'registrations_event_org_fk',
    table: 'registrations',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'registrations_participant_org_fk',
    table: 'registrations',
    columns: ['organization_id', 'participant_id'],
    referencedTable: 'participants',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'registrations_ticket_org_event_fk',
    table: 'registrations',
    columns: ['organization_id', 'event_id', 'ticket_id'],
    referencedTable: 'tickets',
    referencedColumns: ['organization_id', 'event_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  }),
  compositeForeignKey({
    name: 'transactions_event_org_fk',
    table: 'transactions',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'transactions_registration_org_event_fk',
    table: 'transactions',
    columns: ['organization_id', 'event_id', 'registration_id'],
    referencedTable: 'registrations',
    referencedColumns: ['organization_id', 'event_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  }),
  compositeForeignKey({
    name: 'transactions_reservation_org_event_fk',
    table: 'transactions',
    columns: ['organization_id', 'event_id', 'booth_reservation_id'],
    referencedTable: 'booth_reservations',
    referencedColumns: ['organization_id', 'event_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  }),
  compositeForeignKey({
    name: 'refunds_transaction_org_fk',
    table: 'refunds',
    columns: ['organization_id', 'transaction_id'],
    referencedTable: 'transactions',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'checkins_event_org_fk',
    table: 'check_ins',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'checkins_participant_org_fk',
    table: 'check_ins',
    columns: ['organization_id', 'participant_id'],
    referencedTable: 'participants',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'checkins_registration_org_event_fk',
    table: 'check_ins',
    columns: ['organization_id', 'event_id', 'registration_id'],
    referencedTable: 'registrations',
    referencedColumns: ['organization_id', 'event_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  }),
  compositeForeignKey({
    name: 'checkins_registration_org_participant_fk',
    table: 'check_ins',
    columns: ['organization_id', 'participant_id', 'registration_id'],
    referencedTable: 'registrations',
    referencedColumns: ['organization_id', 'participant_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  }),
  compositeForeignKey({
    name: 'booths_event_org_fk',
    table: 'booths',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'booth_reservations_event_org_fk',
    table: 'booth_reservations',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'booth_reservations_booth_org_event_fk',
    table: 'booth_reservations',
    columns: ['organization_id', 'event_id', 'booth_id'],
    referencedTable: 'booths',
    referencedColumns: ['organization_id', 'event_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  }),
  compositeForeignKey({
    name: 'booth_reservations_exhibitor_org_fk',
    table: 'booth_reservations',
    columns: ['organization_id', 'exhibitor_id'],
    referencedTable: 'exhibitors',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'imports_event_org_fk',
    table: 'imports',
    columns: ['organization_id', 'event_id'],
    referencedTable: 'events',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
  compositeForeignKey({
    name: 'participants_merge_org_fk',
    table: 'participants',
    columns: ['organization_id', 'merged_into_participant_id'],
    referencedTable: 'participants',
    referencedColumns: ['organization_id', 'id'],
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  }),
];

export const TRIGGER_FUNCTIONS: TriggerFunctionDefinition[] = [
  {
    name: 'enforce_refund_cap',
    schema: 'public',
    identityArguments: '',
    returnType: 'trigger',
    language: 'plpgsql',
    securityDefiner: false,
    volatility: 'v',
    configuration: ['search_path=pg_catalog, public'],
    definitionMd5: 'f3e8cba9b9ac17bf6ce11325e55ce12c',
  },
  {
    name: 'prevent_immutable_mutation',
    schema: 'public',
    identityArguments: '',
    returnType: 'trigger',
    language: 'plpgsql',
    securityDefiner: false,
    volatility: 'v',
    configuration: [],
    definitionMd5: '77a565284de930962bcfda27ae526440',
  },
  {
    name: 'set_updated_at_if_unchanged',
    schema: 'public',
    identityArguments: '',
    returnType: 'trigger',
    language: 'plpgsql',
    securityDefiner: false,
    volatility: 'v',
    configuration: [],
    definitionMd5: '50d052f2cdf9c7026f720ecec1669e38',
  },
];

export const TRIGGER_FUNCTION_NAMES: string[] = TRIGGER_FUNCTIONS.map((item) => item.name);

function trigger(key: Omit<TriggerDefinition, 'functionSchema' | 'level'>): TriggerDefinition {
  return { ...key, functionSchema: 'public', level: 'ROW' };
}

export const TRIGGERS: TriggerDefinition[] = [
  trigger({
    name: 'trg_refund_cap',
    table: 'refunds',
    functionName: 'enforce_refund_cap',
    timing: 'BEFORE',
    operations: ['INSERT'],
  }),
  trigger({
    name: 'trg_checkin_immutable',
    table: 'check_ins',
    functionName: 'prevent_immutable_mutation',
    timing: 'BEFORE',
    operations: ['UPDATE', 'DELETE'],
  }),
  trigger({
    name: 'trg_refund_immutable',
    table: 'refunds',
    functionName: 'prevent_immutable_mutation',
    timing: 'BEFORE',
    operations: ['UPDATE', 'DELETE'],
  }),
  trigger({
    name: 'trg_audit_immutable',
    table: 'audit_logs',
    functionName: 'prevent_immutable_mutation',
    timing: 'BEFORE',
    operations: ['UPDATE', 'DELETE'],
  }),
  ...UPDATED_AT_TABLES.map((table): TriggerDefinition =>
    trigger({
      name: 'trg_touch_updated_at',
      table,
      functionName: 'set_updated_at_if_unchanged',
      timing: 'BEFORE',
      operations: ['UPDATE'],
    }),
  ),
];

export const REQUIRED_NOT_NULL_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'api_keys', column: 'scopes' },
];

export const PROTECTED_OBJECTS: ProtectedObjects = {
  tables: new Set<string>([...ALL_TABLES, '_prisma_migrations']),
  constraints: new Set<string>([
    ...REPLACED_OBJECTS.map((item) => item.name),
    ...COMPOSITE_FOREIGN_KEYS.map((item) => item.name),
    ...CHECK_CONSTRAINTS.map((item) => item.name),
    ...UNIQUE_CONSTRAINTS.map((item) => item.name),
  ]),
  indexes: new Set<string>([
    ...PARTIAL_UNIQUE_INDEXES.map((item) => item.name),
    ...TRIGRAM_INDEXES.map((item) => item.name),
    // PostgreSQL unique constraints are backed by an index of the same name.
    // Prisma introspects them as unique indexes and emits DROP INDEX for them.
    ...UNIQUE_CONSTRAINTS.map((item) => item.name),
  ]),
  triggers: new Set<string>(TRIGGERS.map((item) => item.name)),
  functions: new Set<string>(TRIGGER_FUNCTION_NAMES),
  schemas: new Set<string>([SCHEMA_NAME]),
  extensions: new Set<string>(['pg_trgm', 'citext']),
  roles: new Set<string>([RUNTIME_GROUP_ROLE]),
};
