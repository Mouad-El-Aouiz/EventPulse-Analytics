-- Contraintes d'integrite non exprimables dans le schema Prisma.
-- Source : docs/phase-3-architecture/DATABASE_DESIGN.md §6 et PRISMA_SCHEMA_DESIGN.md §6.
-- Migration additive et non destructive.

-- 1. Unicites partielles (contraintes conditionnelles).

-- BR-EXH-003 : une seule reservation active par stand.
CREATE UNIQUE INDEX "booth_reservations_one_active_uq"
  ON "booth_reservations" ("booth_id")
  WHERE "status" = 'ACTIVE';

-- BR-CHK-005 : un seul check-in valide par participant et evenement.
CREATE UNIQUE INDEX "checkins_valid_unique_uq"
  ON "check_ins" ("organization_id", "event_id", "participant_id")
  WHERE "status" = 'VALID';

-- BR-REG-001 / KPI-REV-006 : au plus une transaction billet par inscription.
CREATE UNIQUE INDEX "transactions_ticket_registration_uq"
  ON "transactions" ("registration_id")
  WHERE "type" = 'TICKET';

-- BR-EXH-005 : au plus une transaction stand par reservation.
CREATE UNIQUE INDEX "transactions_booth_reservation_uq"
  ON "transactions" ("booth_reservation_id")
  WHERE "type" = 'BOOTH';

-- BR-EXH-002 : code de stand unique par evenement, reusable apres soft delete.
CREATE UNIQUE INDEX "booths_org_event_code_uq"
  ON "booths" ("organization_id", "event_id", "code")
  WHERE "deleted_at" IS NULL;

-- US-ORG-01 : une seule invitation en attente par email et organisation.
CREATE UNIQUE INDEX "invitations_pending_email_uq"
  ON "invitations" ("organization_id", "email")
  WHERE "status" = 'PENDING';

-- 2. Contraintes CHECK.

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_currency_chk" CHECK ("currency" = 'EUR'),
  ADD CONSTRAINT "organizations_export_retention_chk" CHECK ("export_retention_days" BETWEEN 1 AND 365);

ALTER TABLE "events"
  ADD CONSTRAINT "events_period_chk" CHECK ("end_at" > "start_at"),
  ADD CONSTRAINT "events_check_in_offsets_chk" CHECK (
    "check_in_opens_offset_minutes" <= "check_in_closes_offset_minutes"
  );

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_price_chk" CHECK ("price_amount" >= 0),
  ADD CONSTRAINT "tickets_currency_chk" CHECK ("currency" = 'EUR');

ALTER TABLE "participants"
  ADD CONSTRAINT "participants_birth_year_chk" CHECK ("birth_year" BETWEEN 1900 AND 2100),
  ADD CONSTRAINT "participants_merge_not_self_chk" CHECK (
    "merged_into_participant_id" IS NULL OR "merged_into_participant_id" <> "id"
  );

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_chk" CHECK ("amount" > 0),
  ADD CONSTRAINT "transactions_currency_chk" CHECK ("currency" = 'EUR'),
  ADD CONSTRAINT "transactions_type_reference_chk" CHECK (
    ("type" = 'TICKET' AND "registration_id" IS NOT NULL AND "booth_reservation_id" IS NULL)
    OR ("type" = 'BOOTH' AND "booth_reservation_id" IS NOT NULL AND "registration_id" IS NULL)
  ),
  ADD CONSTRAINT "transactions_paid_at_chk" CHECK (
    ("status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')) = ("paid_at" IS NOT NULL)
  );

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount" > 0),
  ADD CONSTRAINT "refunds_currency_chk" CHECK ("currency" = 'EUR');

ALTER TABLE "check_ins"
  ADD CONSTRAINT "check_ins_status_reason_chk" CHECK (
    (
      "status" = 'VALID'
      AND "reason" IS NULL
      AND "event_id" IS NOT NULL
      AND "participant_id" IS NOT NULL
      AND "registration_id" IS NOT NULL
    )
    OR ("status" = 'INVALID' AND "reason" IS NOT NULL)
  );

ALTER TABLE "booths"
  ADD CONSTRAINT "booths_area_chk" CHECK ("area_sqm" >= 0),
  ADD CONSTRAINT "booths_price_chk" CHECK ("price_amount" >= 0),
  ADD CONSTRAINT "booths_currency_chk" CHECK ("currency" = 'EUR');

ALTER TABLE "booth_reservations"
  ADD CONSTRAINT "booth_reservations_price_chk" CHECK ("price_amount" >= 0),
  ADD CONSTRAINT "booth_reservations_currency_chk" CHECK ("currency" = 'EUR'),
  ADD CONSTRAINT "booth_reservations_status_released_chk" CHECK (
    ("status" = 'ACTIVE' AND "released_at" IS NULL)
    OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL)
  );

ALTER TABLE "imports"
  ADD CONSTRAINT "imports_counters_chk" CHECK (
    "total_rows" >= 0
    AND "processed_rows" >= 0
    AND "success_rows" >= 0
    AND "error_rows" >= 0
  );

ALTER TABLE "exports"
  ADD CONSTRAINT "exports_file_size_chk" CHECK ("file_size_bytes" IS NULL OR "file_size_bytes" >= 0);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_metadata_size_chk" CHECK (pg_column_size("metadata") <= 8192);

-- 3. Isolation multi-tenant par cles etrangeres composites.
-- Les FK simples sont remplacees par des FK (organization_id, <parent_id>) vers
-- les index UNIQUE (organization_id, id), rendant une reference cross-tenant
-- impossible au niveau PostgreSQL. Les index simples necessaires aux jointures
-- Prisma sont conserves.

ALTER TABLE "events" DROP CONSTRAINT "events_manager_fk";
ALTER TABLE "events"
  ADD CONSTRAINT "events_manager_org_fk"
  FOREIGN KEY ("organization_id", "manager_membership_id")
  REFERENCES "memberships" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets" DROP CONSTRAINT "tickets_event_fk";
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registrations" DROP CONSTRAINT "registrations_event_fk";
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_participant_fk";
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_ticket_fk";
ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "registrations_participant_org_fk"
  FOREIGN KEY ("organization_id", "participant_id")
  REFERENCES "participants" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "registrations_ticket_org_fk"
  FOREIGN KEY ("organization_id", "ticket_id")
  REFERENCES "tickets" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_event_fk";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_registration_fk";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_reservation_fk";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "transactions_registration_org_fk"
  FOREIGN KEY ("organization_id", "registration_id")
  REFERENCES "registrations" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "transactions_reservation_org_fk"
  FOREIGN KEY ("organization_id", "booth_reservation_id")
  REFERENCES "booth_reservations" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_transaction_fk";
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_transaction_org_fk"
  FOREIGN KEY ("organization_id", "transaction_id")
  REFERENCES "transactions" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "check_ins" DROP CONSTRAINT "checkins_event_fk";
ALTER TABLE "check_ins" DROP CONSTRAINT "checkins_participant_fk";
ALTER TABLE "check_ins" DROP CONSTRAINT "checkins_registration_fk";
ALTER TABLE "check_ins"
  ADD CONSTRAINT "checkins_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "checkins_participant_org_fk"
  FOREIGN KEY ("organization_id", "participant_id")
  REFERENCES "participants" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "checkins_registration_org_fk"
  FOREIGN KEY ("organization_id", "registration_id")
  REFERENCES "registrations" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booths" DROP CONSTRAINT "booths_event_fk";
ALTER TABLE "booths"
  ADD CONSTRAINT "booths_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booth_reservations" DROP CONSTRAINT "booth_reservations_event_fk";
ALTER TABLE "booth_reservations" DROP CONSTRAINT "booth_reservations_booth_fk";
ALTER TABLE "booth_reservations" DROP CONSTRAINT "booth_reservations_exhibitor_fk";
ALTER TABLE "booth_reservations"
  ADD CONSTRAINT "booth_reservations_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "booth_reservations_booth_org_fk"
  FOREIGN KEY ("organization_id", "booth_id")
  REFERENCES "booths" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "booth_reservations_exhibitor_org_fk"
  FOREIGN KEY ("organization_id", "exhibitor_id")
  REFERENCES "exhibitors" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imports" DROP CONSTRAINT "imports_event_fk";
ALTER TABLE "imports"
  ADD CONSTRAINT "imports_event_org_fk"
  FOREIGN KEY ("organization_id", "event_id")
  REFERENCES "events" ("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trigger, index trigram et privileges restent dans les migrations additives
-- 0040 a 0080 decrites dans PRISMA_SCHEMA_DESIGN.md §9.2.
