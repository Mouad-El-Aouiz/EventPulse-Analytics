import { randomUUID } from 'node:crypto';
import type {
  ApiKey,
  AuditLog,
  Booth,
  BoothReservation,
  CheckIn,
  Event,
  Exhibitor,
  Import,
  Invitation,
  Membership,
  Organization,
  Participant,
  PrismaClient,
  Refund,
  Registration,
  Ticket,
  Transaction,
  User,
} from '@prisma/client';

let sequence = 0;

export function unique(prefix: string): string {
  sequence += 1;

  return `${prefix}-${randomUUID().slice(0, 8)}-${sequence}`;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${unique(prefix)}@example.test`.toLowerCase();
}

export async function createUser(
  client: PrismaClient,
  overrides: { email?: string; displayName?: string } = {},
): Promise<User> {
  return client.user.create({
    data: {
      email: overrides.email ?? uniqueEmail(),
      passwordHash: 'test-password-hash',
      displayName: overrides.displayName ?? unique('Test User'),
    },
  });
}

export async function createOrganization(
  client: PrismaClient,
  overrides: { name?: string; slug?: string } = {},
): Promise<Organization> {
  return client.organization.create({
    data: {
      name: overrides.name ?? unique('Test Organization'),
      slug: overrides.slug ?? unique('org'),
    },
  });
}

export async function createMembership(
  client: PrismaClient,
  organizationId: string,
  userId: string,
  role: 'OWNER' | 'ADMIN' | 'EVENT_MANAGER' | 'ANALYST' | 'VIEWER' = 'OWNER',
): Promise<Membership> {
  return client.membership.create({
    data: { organizationId, userId, role },
  });
}

export interface Tenant {
  organization: Organization;
  user: User;
  membership: Membership;
}

export async function createTenant(client: PrismaClient): Promise<Tenant> {
  const organization = await createOrganization(client);
  const user = await createUser(client);
  const membership = await createMembership(client, organization.id, user.id);

  return { organization, user, membership };
}

export async function createEvent(
  client: PrismaClient,
  organizationId: string,
  overrides: { name?: string; managerMembershipId?: string } = {},
): Promise<Event> {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return client.event.create({
    data: {
      organizationId,
      name: overrides.name ?? unique('Test Event'),
      type: 'CONFERENCE',
      status: 'PUBLISHED',
      startAt,
      endAt: new Date(startAt.getTime() + 8 * 60 * 60 * 1000),
      timezone: 'Europe/Paris',
      managerMembershipId: overrides.managerMembershipId,
    },
  });
}

export async function createTicket(
  client: PrismaClient,
  organizationId: string,
  eventId: string,
  overrides: { name?: string; priceAmount?: string } = {},
): Promise<Ticket> {
  return client.ticket.create({
    data: {
      organizationId,
      eventId,
      name: overrides.name ?? unique('Standard'),
      priceAmount: overrides.priceAmount ?? '25.00',
    },
  });
}

export async function createParticipant(
  client: PrismaClient,
  organizationId: string,
  overrides: { firstName?: string; lastName?: string; email?: string } = {},
): Promise<Participant> {
  return client.participant.create({
    data: {
      organizationId,
      firstName: overrides.firstName ?? 'Ada',
      lastName: overrides.lastName ?? unique('Lovelace'),
      email: overrides.email ?? uniqueEmail('participant'),
    },
  });
}

export async function createRegistration(
  client: PrismaClient,
  input: {
    organizationId: string;
    eventId: string;
    participantId: string;
    ticketId: string;
    status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLISTED';
  },
): Promise<Registration> {
  return client.registration.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      participantId: input.participantId,
      ticketId: input.ticketId,
      status: input.status ?? 'CONFIRMED',
      source: 'MANUAL',
    },
  });
}

export async function createTransaction(
  client: PrismaClient,
  input: {
    organizationId: string;
    eventId: string;
    type: 'TICKET' | 'BOOTH';
    registrationId?: string;
    boothReservationId?: string;
    status?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
    amount?: string;
  },
): Promise<Transaction> {
  const status = input.status ?? 'PAID';
  const requiresPaidAt = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(status);

  return client.transaction.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      type: input.type,
      status,
      amount: input.amount ?? '100.00',
      registrationId: input.registrationId,
      boothReservationId: input.boothReservationId,
      paidAt: requiresPaidAt ? new Date() : null,
    },
  });
}

export async function createRefund(
  client: PrismaClient,
  input: {
    organizationId: string;
    transactionId: string;
    amount: string;
    reason?: string;
    createdByUserId?: string;
  },
): Promise<Refund> {
  return client.refund.create({
    data: {
      organizationId: input.organizationId,
      transactionId: input.transactionId,
      amount: input.amount,
      reason: input.reason ?? unique('refund'),
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function createCheckIn(
  client: PrismaClient,
  input: {
    organizationId: string;
    eventId?: string;
    participantId?: string;
    registrationId?: string;
    status?: 'VALID' | 'INVALID';
    reason?:
      | 'OUTSIDE_WINDOW'
      | 'DUPLICATE'
      | 'REGISTRATION_CANCELLED'
      | 'REGISTRATION_NOT_CONFIRMED'
      | 'REGISTRATION_NOT_FOUND'
      | 'PARTICIPANT_NOT_FOUND'
      | 'EVENT_NOT_FOUND'
      | 'EVENT_CANCELLED';
    createdByUserId?: string;
  },
): Promise<CheckIn> {
  return client.checkIn.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      participantId: input.participantId,
      registrationId: input.registrationId,
      status: input.status ?? 'VALID',
      reason: input.reason,
      source: 'MANUAL',
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function createAuditLog(
  client: PrismaClient,
  organizationId: string,
  overrides: { actorUserId?: string } = {},
): Promise<AuditLog> {
  return client.auditLog.create({
    data: {
      organizationId,
      category: 'AUTH',
      actorUserId: overrides.actorUserId,
      actionType: 'TEST_ACTION',
      resourceType: 'test',
      result: 'SUCCESS',
    },
  });
}

export async function createExhibitor(
  client: PrismaClient,
  organizationId: string,
): Promise<Exhibitor> {
  return client.exhibitor.create({
    data: {
      organizationId,
      name: unique('Exhibitor'),
    },
  });
}

export async function createBooth(
  client: PrismaClient,
  organizationId: string,
  eventId: string,
  overrides: { code?: string } = {},
): Promise<Booth> {
  return client.booth.create({
    data: {
      organizationId,
      eventId,
      code: overrides.code ?? unique('booth'),
    },
  });
}

export async function createBoothReservation(
  client: PrismaClient,
  input: {
    organizationId: string;
    eventId: string;
    boothId: string;
    exhibitorId: string;
    status?: 'ACTIVE' | 'RELEASED';
  },
): Promise<BoothReservation> {
  const status = input.status ?? 'ACTIVE';

  return client.boothReservation.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      boothId: input.boothId,
      exhibitorId: input.exhibitorId,
      status,
      releasedAt: status === 'RELEASED' ? new Date() : null,
    },
  });
}

export async function createImport(
  client: PrismaClient,
  input: {
    organizationId: string;
    createdByUserId: string;
    eventId?: string;
  },
): Promise<Import> {
  return client.import.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      type: 'PARTICIPANTS',
      format: 'CSV',
      idempotencyKey: unique('idem').padEnd(64, '0').slice(0, 64),
      duplicateStrategy: 'SKIP',
      originalFilename: 'participants.csv',
      storageKey: unique('storage/imports'),
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function createApiKey(
  client: PrismaClient,
  input: {
    organizationId: string;
    createdByUserId: string;
    scopes: string[];
  },
): Promise<ApiKey> {
  return client.apiKey.create({
    data: {
      organizationId: input.organizationId,
      name: unique('key'),
      keyPrefix: unique('ep').slice(0, 16),
      keyHash: randomUUID(),
      scopes: input.scopes,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function createInvitation(
  client: PrismaClient,
  organizationId: string,
  invitedByUserId: string,
  input: { email?: string; status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' } = {},
): Promise<Invitation> {
  return client.invitation.create({
    data: {
      organizationId,
      email: input.email ?? uniqueEmail('invitee'),
      role: 'VIEWER',
      status: input.status ?? 'PENDING',
      tokenHash: randomUUID(),
      invitedByUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
