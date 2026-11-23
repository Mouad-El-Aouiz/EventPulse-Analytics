import { afterAll, describe, expect, it } from 'vitest';
import { expectUniqueViolation } from './helpers/assertions.js';
import { createTestClient } from './helpers/database.js';
import {
  createBooth,
  createBoothReservation,
  createCheckIn,
  createEvent,
  createExhibitor,
  createInvitation,
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

describe('documented partial unique indexes', () => {
  it('allows only one active reservation per booth', async () => {
    const tenant = await createTenant(client);
    const organizationId = tenant.organization.id;
    const event = await createEvent(client, organizationId);
    const exhibitor = await createExhibitor(client, organizationId);
    const booth = await createBooth(client, organizationId, event.id);
    const reservation = await createBoothReservation(client, {
      organizationId,
      eventId: event.id,
      boothId: booth.id,
      exhibitorId: exhibitor.id,
    });

    await expectUniqueViolation(
      createBoothReservation(client, {
        organizationId,
        eventId: event.id,
        boothId: booth.id,
        exhibitorId: exhibitor.id,
      }),
      ['booth_id'],
    );

    await client.boothReservation.update({
      where: { id: reservation.id },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });

    const replacement = await createBoothReservation(client, {
      organizationId,
      eventId: event.id,
      boothId: booth.id,
      exhibitorId: exhibitor.id,
    });

    expect(replacement.status).toBe('ACTIVE');
  });

  it('allows only one valid check-in per participant and event', async () => {
    const tenant = await createTenant(client);
    const organizationId = tenant.organization.id;
    const event = await createEvent(client, organizationId);
    const ticket = await createTicket(client, organizationId, event.id);
    const participant = await createParticipant(client, organizationId);
    const registration = await createRegistration(client, {
      organizationId,
      eventId: event.id,
      participantId: participant.id,
      ticketId: ticket.id,
    });

    await createCheckIn(client, {
      organizationId,
      eventId: event.id,
      participantId: participant.id,
      registrationId: registration.id,
    });

    await expectUniqueViolation(
      createCheckIn(client, {
        organizationId,
        eventId: event.id,
        participantId: participant.id,
        registrationId: registration.id,
      }),
      ['organization_id', 'event_id', 'participant_id'],
    );

    const invalid = await createCheckIn(client, {
      organizationId,
      eventId: event.id,
      participantId: participant.id,
      registrationId: registration.id,
      status: 'INVALID',
      reason: 'DUPLICATE',
    });

    expect(invalid.status).toBe('INVALID');
  });

  it('allows only one ticket transaction per registration', async () => {
    const tenant = await createTenant(client);
    const organizationId = tenant.organization.id;
    const event = await createEvent(client, organizationId);
    const ticket = await createTicket(client, organizationId, event.id);
    const participant = await createParticipant(client, organizationId);
    const registration = await createRegistration(client, {
      organizationId,
      eventId: event.id,
      participantId: participant.id,
      ticketId: ticket.id,
    });

    await createTransaction(client, {
      organizationId,
      eventId: event.id,
      type: 'TICKET',
      registrationId: registration.id,
    });

    await expectUniqueViolation(
      createTransaction(client, {
        organizationId,
        eventId: event.id,
        type: 'TICKET',
        registrationId: registration.id,
      }),
      ['registration_id'],
    );
  });

  it('allows only one booth transaction per reservation', async () => {
    const tenant = await createTenant(client);
    const organizationId = tenant.organization.id;
    const event = await createEvent(client, organizationId);
    const exhibitor = await createExhibitor(client, organizationId);
    const booth = await createBooth(client, organizationId, event.id);
    const reservation = await createBoothReservation(client, {
      organizationId,
      eventId: event.id,
      boothId: booth.id,
      exhibitorId: exhibitor.id,
    });

    await createTransaction(client, {
      organizationId,
      eventId: event.id,
      type: 'BOOTH',
      boothReservationId: reservation.id,
    });

    await expectUniqueViolation(
      createTransaction(client, {
        organizationId,
        eventId: event.id,
        type: 'BOOTH',
        boothReservationId: reservation.id,
      }),
      ['booth_reservation_id'],
    );
  });

  it('reuses a booth code after soft deletion', async () => {
    const tenant = await createTenant(client);
    const organizationId = tenant.organization.id;
    const event = await createEvent(client, organizationId);
    const code = `B${Date.now().toString(36)}`;
    const booth = await createBooth(client, organizationId, event.id, { code });

    await expectUniqueViolation(createBooth(client, organizationId, event.id, { code }), [
      'organization_id',
      'event_id',
      'code',
    ]);

    await client.booth.update({
      where: { id: booth.id },
      data: { deletedAt: new Date() },
    });

    const replacement = await createBooth(client, organizationId, event.id, { code });

    expect(replacement.code).toBe(code);
  });

  it('allows a new pending invitation after the previous one is accepted', async () => {
    const tenant = await createTenant(client);
    const email = `invitee-${Date.now()}@example.test`;
    const invitation = await createInvitation(client, tenant.organization.id, tenant.user.id, {
      email,
    });

    await expectUniqueViolation(
      createInvitation(client, tenant.organization.id, tenant.user.id, { email }),
      ['organization_id', 'email'],
    );

    await client.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    const replacement = await createInvitation(client, tenant.organization.id, tenant.user.id, {
      email,
    });

    expect(replacement.status).toBe('PENDING');
  });
});
