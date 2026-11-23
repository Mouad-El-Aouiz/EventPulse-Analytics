-- Coherence evenementielle au niveau PostgreSQL.
--
-- Les FK 2 colonnes existantes garantissent l'isolation tenant, mais pas que
-- le billet, le stand, l'inscription ou la reservation appartiennent au meme
-- evenement que la ligne referencante. Les contraintes uniques 3 colonnes
-- ci-dessous servent de cibles aux FK 3 colonnes ajoutees ensuite.

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_org_event_id_uq"
  UNIQUE ("organization_id", "event_id", "id");

ALTER TABLE "booths"
  ADD CONSTRAINT "booths_org_event_id_uq"
  UNIQUE ("organization_id", "event_id", "id");

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_org_event_id_uq"
  UNIQUE ("organization_id", "event_id", "id");

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_org_participant_id_uq"
  UNIQUE ("organization_id", "participant_id", "id");

ALTER TABLE "booth_reservations"
  ADD CONSTRAINT "booth_reservations_org_event_id_uq"
  UNIQUE ("organization_id", "event_id", "id");

-- Remplacement des FK composites 2 colonnes par des FK 3 colonnes.
-- ON UPDATE RESTRICT empeche la reaffectation d'un evenement de cascader
-- silencieusement vers des inscriptions, transactions ou check-ins.

-- integrity-guard: allow DROP CONSTRAINT registrations_ticket_org_fk (remplacee par registrations_ticket_org_event_fk)
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_ticket_org_fk";
ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_ticket_org_event_fk"
  FOREIGN KEY ("organization_id", "event_id", "ticket_id")
  REFERENCES "tickets" ("organization_id", "event_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- integrity-guard: allow DROP CONSTRAINT booth_reservations_booth_org_fk (remplacee par booth_reservations_booth_org_event_fk)
ALTER TABLE "booth_reservations" DROP CONSTRAINT "booth_reservations_booth_org_fk";
ALTER TABLE "booth_reservations"
  ADD CONSTRAINT "booth_reservations_booth_org_event_fk"
  FOREIGN KEY ("organization_id", "event_id", "booth_id")
  REFERENCES "booths" ("organization_id", "event_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- integrity-guard: allow DROP CONSTRAINT transactions_registration_org_fk (remplacee par transactions_registration_org_event_fk)
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_registration_org_fk";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_registration_org_event_fk"
  FOREIGN KEY ("organization_id", "event_id", "registration_id")
  REFERENCES "registrations" ("organization_id", "event_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- integrity-guard: allow DROP CONSTRAINT transactions_reservation_org_fk (remplacee par transactions_reservation_org_event_fk)
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_reservation_org_fk";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_reservation_org_event_fk"
  FOREIGN KEY ("organization_id", "event_id", "booth_reservation_id")
  REFERENCES "booth_reservations" ("organization_id", "event_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- integrity-guard: allow DROP CONSTRAINT checkins_registration_org_fk (remplacee par deux FK 3 colonnes)
ALTER TABLE "check_ins" DROP CONSTRAINT "checkins_registration_org_fk";
ALTER TABLE "check_ins"
  ADD CONSTRAINT "checkins_registration_org_event_fk"
  FOREIGN KEY ("organization_id", "event_id", "registration_id")
  REFERENCES "registrations" ("organization_id", "event_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "checkins_registration_org_participant_fk"
  FOREIGN KEY ("organization_id", "participant_id", "registration_id")
  REFERENCES "registrations" ("organization_id", "participant_id", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
