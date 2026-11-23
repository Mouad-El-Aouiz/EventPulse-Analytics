import { afterAll, describe, expect, it } from 'vitest';
import { expectFailure } from './helpers/assertions.js';
import { createTestClient } from './helpers/database.js';
import {
  createBooth,
  createBoothReservation,
  createCheckIn,
  createEvent,
  createExhibitor,
  createImport,
  createParticipant,
  createRegistration,
  createTenant,
  createTicket,
  createTransaction,
} from './helpers/factories.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

async function createTwoEventFixture() {
  const tenant = await createTenant(client);
  const organizationId = tenant.organization.id;
  const eventA = await createEvent(client, organizationId, { name: 'Event A' });
  const eventB = await createEvent(client, organizationId, { name: 'Event B' });
  const ticketA = await createTicket(client, organizationId, eventA.id);
  const ticketB = await createTicket(client, organizationId, eventB.id);
  const participant = await createParticipant(client, organizationId);
  const otherParticipant = await createParticipant(client, organizationId);
  const registrationB = await createRegistration(client, {
    organizationId,
    eventId: eventB.id,
    participantId: participant.id,
    ticketId: ticketB.id,
  });
  const exhibitor = await createExhibitor(client, organizationId);
  const boothB = await createBooth(client, organizationId, eventB.id);
  const reservationB = await createBoothReservation(client, {
    organizationId,
    eventId: eventB.id,
    boothId: boothB.id,
    exhibitorId: exhibitor.id,
  });

  return {
    organizationId,
    eventA,
    eventB,
    ticketA,
    ticketB,
    participant,
    otherParticipant,
    registrationB,
    exhibitor,
    boothB,
    reservationB,
  };
}

describe('event level coherence', () => {
  it('rejects a registration using a ticket from another event', async () => {
    const fixture = await createTwoEventFixture();

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "registrations" ("organization_id", "event_id", "participant_id", "ticket_id", "status", "source", "updated_at") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"registration_status", $6::"registration_source", now())',
        fixture.organizationId,
        fixture.eventA.id,
        fixture.participant.id,
        fixture.ticketB.id,
        'CONFIRMED',
        'MANUAL',
      ),
      /registrations_ticket_org_event_fk/i,
    );
  });

  it('rejects a booth reservation using a booth from another event', async () => {
    const fixture = await createTwoEventFixture();
    const unreservedBoothB = await createBooth(client, fixture.organizationId, fixture.eventB.id);

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "booth_reservations" ("organization_id", "event_id", "booth_id", "exhibitor_id", "status", "updated_at") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"reservation_status", now())',
        fixture.organizationId,
        fixture.eventA.id,
        unreservedBoothB.id,
        fixture.exhibitor.id,
        'ACTIVE',
      ),
      /booth_reservations_booth_org_event_fk/i,
    );
  });

  it('rejects a ticket transaction pointing to a registration from another event', async () => {
    const fixture = await createTwoEventFixture();

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "transactions" ("organization_id", "event_id", "type", "amount", "registration_id", "updated_at") VALUES ($1::uuid, $2::uuid, $3::"transaction_type", $4::numeric, $5::uuid, now())',
        fixture.organizationId,
        fixture.eventA.id,
        'TICKET',
        '50.00',
        fixture.registrationB.id,
      ),
      /transactions_registration_org_event_fk/i,
    );
  });

  it('rejects a booth transaction pointing to a reservation from another event', async () => {
    const fixture = await createTwoEventFixture();

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "transactions" ("organization_id", "event_id", "type", "amount", "booth_reservation_id", "updated_at") VALUES ($1::uuid, $2::uuid, $3::"transaction_type", $4::numeric, $5::uuid, now())',
        fixture.organizationId,
        fixture.eventA.id,
        'BOOTH',
        '50.00',
        fixture.reservationB.id,
      ),
      /transactions_reservation_org_event_fk/i,
    );
  });

  it('rejects a check-in whose registration belongs to another event', async () => {
    const fixture = await createTwoEventFixture();

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "check_ins" ("organization_id", "event_id", "participant_id", "registration_id", "status", "source") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"check_in_status", $6::"check_in_source")',
        fixture.organizationId,
        fixture.eventA.id,
        fixture.participant.id,
        fixture.registrationB.id,
        'VALID',
        'MANUAL',
      ),
      /checkins_registration_org_event_fk/i,
    );
  });

  it('rejects a check-in whose participant differs from the registration participant', async () => {
    const fixture = await createTwoEventFixture();

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "check_ins" ("organization_id", "event_id", "participant_id", "registration_id", "status", "source") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"check_in_status", $6::"check_in_source")',
        fixture.organizationId,
        fixture.eventB.id,
        fixture.otherParticipant.id,
        fixture.registrationB.id,
        'VALID',
        'MANUAL',
      ),
      /checkins_registration_org_participant_fk/i,
    );
  });

  it('rejects moving a mutable transaction to another event through the composite FK', async () => {
    const fixture = await createTwoEventFixture();
    const registration = await createRegistration(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      participantId: fixture.participant.id,
      ticketId: fixture.ticketA.id,
    });
    const transaction = await createTransaction(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      type: 'TICKET',
      registrationId: registration.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "transactions" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        transaction.id,
        fixture.eventB.id,
      ),
      /transactions_registration_org_event_fk/i,
    );
  });

  it('rejects a registration referencing a participant from another organization', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const ticketA = await createTicket(client, tenantA.organization.id, eventA.id);
    const participantB = await createParticipant(client, tenantB.organization.id);

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "registrations" ("organization_id", "event_id", "participant_id", "ticket_id", "status", "source", "updated_at") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"registration_status", $6::"registration_source", now())',
        tenantA.organization.id,
        eventA.id,
        participantB.id,
        ticketA.id,
        'CONFIRMED',
        'MANUAL',
      ),
      /registrations_participant_org_fk/i,
    );
  });

  it('rejects a transaction referencing a registration from another organization', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const ticketB = await createTicket(client, tenantB.organization.id, eventB.id);
    const participantB = await createParticipant(client, tenantB.organization.id);
    const registrationB = await createRegistration(client, {
      organizationId: tenantB.organization.id,
      eventId: eventB.id,
      participantId: participantB.id,
      ticketId: ticketB.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "transactions" ("organization_id", "event_id", "type", "amount", "registration_id", "updated_at") VALUES ($1::uuid, $2::uuid, $3::"transaction_type", $4::numeric, $5::uuid, now())',
        tenantA.organization.id,
        eventA.id,
        'TICKET',
        '50.00',
        registrationB.id,
      ),
      /transactions_registration_org_event_fk/i,
    );
  });

  it('accepts coherent registrations, transactions, reservations and check-ins', async () => {
    const fixture = await createTwoEventFixture();

    const registration = await createRegistration(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      participantId: fixture.participant.id,
      ticketId: fixture.ticketA.id,
    });
    const transaction = await createTransaction(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      type: 'TICKET',
      registrationId: registration.id,
    });
    const boothA = await createBooth(client, fixture.organizationId, fixture.eventA.id);
    const reservationA = await createBoothReservation(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      boothId: boothA.id,
      exhibitorId: fixture.exhibitor.id,
    });
    const boothTransaction = await createTransaction(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      type: 'BOOTH',
      boothReservationId: reservationA.id,
    });
    const checkIn = await createCheckIn(client, {
      organizationId: fixture.organizationId,
      eventId: fixture.eventA.id,
      participantId: fixture.participant.id,
      registrationId: registration.id,
    });

    expect(transaction.id).toBeDefined();
    expect(boothTransaction.id).toBeDefined();
    expect(checkIn.id).toBeDefined();
  });
});

describe('composite foreign key coverage matrix', () => {
  it('rejects an event manager membership from another organization', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const event = await createEvent(client, tenantA.organization.id, {
      managerMembershipId: tenantA.membership.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "events" SET "manager_membership_id" = $2::uuid WHERE "id" = $1::uuid',
        event.id,
        tenantB.membership.id,
      ),
      /events_manager_org_fk/i,
    );
  });

  it('rejects a ticket from another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const ticketA = await createTicket(client, tenantA.organization.id, eventA.id);

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "tickets" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        ticketA.id,
        eventB.id,
      ),
      /tickets_event_org_fk/i,
    );
  });

  it('rejects a registration attached to another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const ticketA = await createTicket(client, tenantA.organization.id, eventA.id);
    const participantA = await createParticipant(client, tenantA.organization.id);
    const registration = await createRegistration(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      participantId: participantA.id,
      ticketId: ticketA.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "registrations" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        registration.id,
        eventB.id,
      ),
      /registrations_event_org_fk|registrations_ticket_org_event_fk/i,
    );
  });

  it('rejects a transaction attached to another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const ticketA = await createTicket(client, tenantA.organization.id, eventA.id);
    const participantA = await createParticipant(client, tenantA.organization.id);
    const registration = await createRegistration(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      participantId: participantA.id,
      ticketId: ticketA.id,
    });
    const transaction = await createTransaction(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      type: 'TICKET',
      registrationId: registration.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "transactions" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        transaction.id,
        eventB.id,
      ),
      /transactions_event_org_fk|transactions_registration_org_event_fk/i,
    );
  });

  it('rejects a refund whose transaction belongs to another organization', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventB = await createEvent(client, tenantB.organization.id);
    const ticketB = await createTicket(client, tenantB.organization.id, eventB.id);
    const participantB = await createParticipant(client, tenantB.organization.id);
    const registrationB = await createRegistration(client, {
      organizationId: tenantB.organization.id,
      eventId: eventB.id,
      participantId: participantB.id,
      ticketId: ticketB.id,
    });
    const transactionB = await createTransaction(client, {
      organizationId: tenantB.organization.id,
      eventId: eventB.id,
      type: 'TICKET',
      registrationId: registrationB.id,
    });

    // The BEFORE INSERT refund trigger runs before the FK check and already
    // rejects the cross-tenant lookup with SQLSTATE 23503. The composite FK is
    // the second line of defense for this relation.
    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "refunds" ("organization_id", "transaction_id", "amount", "currency") VALUES ($1::uuid, $2::uuid, $3::numeric, $4)',
        tenantA.organization.id,
        transactionB.id,
        '10.00',
        'EUR',
      ),
      /refund rejected: transaction .* not found/i,
    );
  });

  // check_ins is immutable: UPDATE is refused by the BEFORE trigger before any
  // FK check runs. Coherence FKs are therefore exercised through INSERTs, the
  // only write path that reaches the composite constraints.
  it('rejects a check-in attached to another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const ticketA = await createTicket(client, tenantA.organization.id, eventA.id);
    const participantA = await createParticipant(client, tenantA.organization.id);
    const registration = await createRegistration(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      participantId: participantA.id,
      ticketId: ticketA.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "check_ins" ("organization_id", "event_id", "participant_id", "registration_id", "status", "source") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"check_in_status", $6::"check_in_source")',
        tenantA.organization.id,
        eventB.id,
        participantA.id,
        registration.id,
        'VALID',
        'MANUAL',
      ),
      /checkins_event_org_fk|checkins_registration_org_event_fk/i,
    );
  });

  it('rejects a check-in attached to another organization participant', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const ticketA = await createTicket(client, tenantA.organization.id, eventA.id);
    const participantA = await createParticipant(client, tenantA.organization.id);
    const participantB = await createParticipant(client, tenantB.organization.id);
    const registration = await createRegistration(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      participantId: participantA.id,
      ticketId: ticketA.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'INSERT INTO "check_ins" ("organization_id", "event_id", "participant_id", "registration_id", "status", "source") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::"check_in_status", $6::"check_in_source")',
        tenantA.organization.id,
        eventA.id,
        participantB.id,
        registration.id,
        'VALID',
        'MANUAL',
      ),
      /checkins_participant_org_fk|checkins_registration_org_participant_fk/i,
    );
  });

  it('rejects a booth attached to another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const boothA = await createBooth(client, tenantA.organization.id, eventA.id);

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "booths" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        boothA.id,
        eventB.id,
      ),
      /booths_event_org_fk/i,
    );
  });

  it('rejects a booth reservation attached to another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const exhibitorA = await createExhibitor(client, tenantA.organization.id);
    const boothA = await createBooth(client, tenantA.organization.id, eventA.id);
    const reservation = await createBoothReservation(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      boothId: boothA.id,
      exhibitorId: exhibitorA.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "booth_reservations" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        reservation.id,
        eventB.id,
      ),
      /booth_reservations_event_org_fk|booth_reservations_booth_org_event_fk/i,
    );
  });

  it('rejects a booth reservation whose exhibitor belongs to another organization', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const exhibitorA = await createExhibitor(client, tenantA.organization.id);
    const exhibitorB = await createExhibitor(client, tenantB.organization.id);
    const boothA = await createBooth(client, tenantA.organization.id, eventA.id);
    const reservation = await createBoothReservation(client, {
      organizationId: tenantA.organization.id,
      eventId: eventA.id,
      boothId: boothA.id,
      exhibitorId: exhibitorA.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "booth_reservations" SET "exhibitor_id" = $2::uuid WHERE "id" = $1::uuid',
        reservation.id,
        exhibitorB.id,
      ),
      /booth_reservations_exhibitor_org_fk/i,
    );
  });

  it('rejects an import attached to another organization event', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const eventA = await createEvent(client, tenantA.organization.id);
    const eventB = await createEvent(client, tenantB.organization.id);
    const importRecord = await createImport(client, {
      organizationId: tenantA.organization.id,
      createdByUserId: tenantA.user.id,
      eventId: eventA.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "imports" SET "event_id" = $2::uuid WHERE "id" = $1::uuid',
        importRecord.id,
        eventB.id,
      ),
      /imports_event_org_fk/i,
    );
  });

  it('rejects a participant merged into another organization participant', async () => {
    const tenantA = await createTenant(client);
    const tenantB = await createTenant(client);
    const participantA = await createParticipant(client, tenantA.organization.id);
    const participantB = await createParticipant(client, tenantB.organization.id);

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "participants" SET "merged_into_participant_id" = $2::uuid WHERE "id" = $1::uuid',
        participantA.id,
        participantB.id,
      ),
      /participants_merge_org_fk/i,
    );
  });

  it('accepts a coherent import referencing an event of the same organization', async () => {
    const tenant = await createTenant(client);
    const event = await createEvent(client, tenant.organization.id);
    const importRecord = await createImport(client, {
      organizationId: tenant.organization.id,
      createdByUserId: tenant.user.id,
      eventId: event.id,
    });

    expect(importRecord.eventId).toBe(event.id);
  });
});
