import type {
  Event,
  Participant,
  Prisma,
  PrismaClient,
  RegistrationSource,
  RegistrationStatus,
  Ticket,
} from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type {
  RegistrationListOptions,
  RegistrationRecord,
  RegistrationSort,
} from './registrations.types.js';
import { REGISTRATION_INCLUDE } from './registrations.types.js';

export interface RegistrationCreateData {
  organizationId: string;
  eventId: string;
  participantId: string;
  ticketId: string;
  source: RegistrationSource;
  sourceDetail: string | null;
}

export interface RegistrationUpdateData {
  status?: RegistrationStatus;
  ticketId?: string;
  cancelledAt?: Date | null;
  deletedAt?: Date | null;
}

function cursorWhere(
  sort: RegistrationSort,
  cursor: { value: string; id: string },
): Prisma.RegistrationWhereInput {
  const ascending = sort.direction === 'asc';
  const value = new Date(cursor.value);

  if (sort.field === 'createdAt') {
    return ascending
      ? {
          OR: [{ createdAt: { gt: value } }, { createdAt: value, id: { gt: cursor.id } }],
        }
      : {
          OR: [{ createdAt: { lt: value } }, { createdAt: value, id: { lt: cursor.id } }],
        };
  }

  return ascending
    ? {
        OR: [{ registeredAt: { gt: value } }, { registeredAt: value, id: { gt: cursor.id } }],
      }
    : {
        OR: [{ registeredAt: { lt: value } }, { registeredAt: value, id: { lt: cursor.id } }],
      };
}

export class RegistrationsRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: RegistrationListOptions): Promise<RegistrationRecord[]> {
    const conditions: Prisma.RegistrationWhereInput[] = [{ deletedAt: null }];
    const { filters } = options;

    if (filters.managerScope !== undefined) {
      conditions.push({
        eventId: filters.managerScope.eventId,
        event: { managerMembershipId: filters.managerScope.membershipId },
      });
    } else if (filters.eventId !== undefined) {
      conditions.push({ eventId: filters.eventId });
    }

    if (filters.participantId !== undefined) {
      conditions.push({ participantId: filters.participantId });
    }

    if (filters.ticketId !== undefined) {
      conditions.push({ ticketId: filters.ticketId });
    }

    if (filters.statuses !== undefined) {
      conditions.push({ status: { in: filters.statuses } });
    }

    if (filters.sources !== undefined) {
      conditions.push({ source: { in: filters.sources } });
    }

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        registeredAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (options.cursor !== null) {
      conditions.push(cursorWhere(options.sort, options.cursor));
    }

    const order: Prisma.RegistrationOrderByWithRelationInput =
      options.sort.field === 'createdAt'
        ? { createdAt: options.sort.direction }
        : { registeredAt: options.sort.direction };

    return this.client.registration.findMany({
      where: { organizationId, AND: conditions },
      include: REGISTRATION_INCLUDE,
      orderBy: [order, { id: options.sort.direction }],
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
    includeDeleted = false,
  ): Promise<RegistrationRecord | null> {
    return tx.registration.findFirst({
      where: {
        id: registrationId,
        organizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: REGISTRATION_INCLUDE,
    });
  }

  findEvent(
    organizationId: string,
    eventId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Event | null> {
    return tx.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
    });
  }

  findParticipant(
    organizationId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Participant | null> {
    return tx.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
        deletedAt: null,
        erasedAt: null,
      },
    });
  }

  findTicket(
    organizationId: string,
    ticketId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Ticket | null> {
    return tx.ticket.findFirst({
      where: { id: ticketId, organizationId, deletedAt: null },
    });
  }

  create(
    data: RegistrationCreateData,
    tx: DatabaseClient = this.client,
  ): Promise<RegistrationRecord> {
    return tx.registration.create({ data, include: REGISTRATION_INCLUDE });
  }

  update(
    organizationId: string,
    registrationId: string,
    data: RegistrationUpdateData,
    tx: DatabaseClient = this.client,
  ): Promise<RegistrationRecord> {
    return tx.registration.update({
      where: { id: registrationId, organizationId },
      data,
      include: REGISTRATION_INCLUDE,
    });
  }

  countTransactions(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.transaction.count({ where: { organizationId, registrationId } });
  }

  countCheckIns(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.checkIn.count({ where: { organizationId, registrationId } });
  }

  hasValidCheckIn(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<boolean> {
    return tx.checkIn
      .count({ where: { organizationId, registrationId, status: 'VALID' } })
      .then((count) => count > 0);
  }
}
