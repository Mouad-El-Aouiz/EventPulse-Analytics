import type { Event, Participant, Prisma, PrismaClient, RegistrationStatus } from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type { ParticipantListOptions, ParticipantSort } from './participants.types.js';

export interface ParticipantCreateData {
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  birthYear: number | null;
  gender: 'FEMALE' | 'MALE' | 'NON_BINARY' | 'UNDISCLOSED' | 'UNKNOWN' | null;
}

export interface ParticipantUpdateData extends Partial<
  Omit<ParticipantCreateData, 'organizationId'>
> {
  anonymizedAt?: Date | null;
  erasedAt?: Date | null;
  mergedIntoParticipantId?: string | null;
  deletedAt?: Date | null;
}

export interface ParticipantRegistrationRecord {
  id: string;
  eventId: string;
  ticketId: string;
  status: RegistrationStatus;
  registeredAt: Date;
  createdAt: Date;
  event: { name: string };
  ticket: { name: string };
}

function cursorWhere(
  sort: ParticipantSort,
  cursor: { value: string; id: string },
): Prisma.ParticipantWhereInput {
  const ascending = sort.direction === 'asc';
  const value = sort.field === 'createdAt' ? new Date(cursor.value) : cursor.value;

  if (sort.field === 'createdAt') {
    const date = value as Date;

    return ascending
      ? {
          OR: [{ createdAt: { gt: date } }, { createdAt: date, id: { gt: cursor.id } }],
        }
      : {
          OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: cursor.id } }],
        };
  }

  if (sort.field === 'email') {
    return ascending
      ? {
          OR: [
            { email: { gt: value as string } },
            { email: value as string, id: { gt: cursor.id } },
          ],
        }
      : {
          OR: [
            { email: { lt: value as string } },
            { email: value as string, id: { lt: cursor.id } },
          ],
        };
  }

  return ascending
    ? {
        OR: [
          { lastName: { gt: value as string } },
          { lastName: value as string, id: { gt: cursor.id } },
        ],
      }
    : {
        OR: [
          { lastName: { lt: value as string } },
          { lastName: value as string, id: { lt: cursor.id } },
        ],
      };
}

export class ParticipantsRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: ParticipantListOptions): Promise<Participant[]> {
    const conditions: Prisma.ParticipantWhereInput[] = [
      { deletedAt: null },
      { mergedIntoParticipantId: null },
    ];
    const { filters } = options;

    if (filters.managerMembershipId !== undefined) {
      conditions.push({
        registrations: {
          some: {
            organizationId,
            deletedAt: null,
            ...(filters.eventId === undefined ? {} : { eventId: filters.eventId }),
            event: {
              managerMembershipId: filters.managerMembershipId,
              deletedAt: null,
            },
          },
        },
      });
    } else if (filters.eventId !== undefined) {
      conditions.push({
        registrations: {
          some: { organizationId, eventId: filters.eventId, deletedAt: null },
        },
      });
    }

    if (filters.q !== undefined) {
      conditions.push({
        OR: [
          { firstName: { contains: filters.q, mode: 'insensitive' } },
          { lastName: { contains: filters.q, mode: 'insensitive' } },
          { email: { contains: filters.q, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.country !== undefined) {
      conditions.push({ country: { equals: filters.country, mode: 'insensitive' } });
    }

    if (filters.region !== undefined) {
      conditions.push({ region: { equals: filters.region, mode: 'insensitive' } });
    }

    if (filters.city !== undefined) {
      conditions.push({ city: { equals: filters.city, mode: 'insensitive' } });
    }

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        createdAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (options.cursor !== null) {
      conditions.push(cursorWhere(options.sort, options.cursor));
    }

    const order: Prisma.ParticipantOrderByWithRelationInput =
      options.sort.field === 'email'
        ? { email: options.sort.direction }
        : options.sort.field === 'lastName'
          ? { lastName: options.sort.direction }
          : { createdAt: options.sort.direction };

    return this.client.participant.findMany({
      where: { organizationId, AND: conditions },
      orderBy: [order, { id: options.sort.direction }],
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
    includeDeleted = false,
  ): Promise<Participant | null> {
    return tx.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
  }

  create(data: ParticipantCreateData, tx: DatabaseClient = this.client): Promise<Participant> {
    return tx.participant.create({ data });
  }

  update(
    organizationId: string,
    participantId: string,
    data: ParticipantUpdateData,
    tx: DatabaseClient = this.client,
  ): Promise<Participant> {
    return tx.participant.update({ where: { id: participantId, organizationId }, data });
  }

  findEventScope(
    organizationId: string,
    eventId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Event | null> {
    return tx.event.findFirst({
      where: { id: eventId, organizationId, deletedAt: null },
    });
  }

  countManagedRegistrations(
    organizationId: string,
    participantId: string,
    membershipId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.registration.count({
      where: {
        organizationId,
        participantId,
        deletedAt: null,
        event: { managerMembershipId: membershipId, deletedAt: null },
      },
    });
  }

  countCheckIns(
    organizationId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.checkIn.count({ where: { organizationId, participantId } });
  }

  countRegistrations(
    organizationId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.registration.count({ where: { organizationId, participantId } });
  }

  countFinancialReferences(
    organizationId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.transaction.count({
      where: {
        organizationId,
        registration: { is: { participantId } },
      },
    });
  }

  countMergedParticipants(
    organizationId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.participant.count({
      where: { organizationId, mergedIntoParticipantId: participantId },
    });
  }

  moveRegistrations(
    organizationId: string,
    sourceParticipantId: string,
    targetParticipantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.registration
      .updateMany({
        where: { organizationId, participantId: sourceParticipantId },
        data: { participantId: targetParticipantId },
      })
      .then((result) => result.count);
  }

  listRegistrations(
    organizationId: string,
    participantId: string,
    eventId: string | null,
    limit: number,
    cursorRegisteredAt: Date | null,
    cursorId: string | null,
  ): Promise<ParticipantRegistrationRecord[]> {
    const conditions: Prisma.RegistrationWhereInput[] = [{ deletedAt: null }];

    if (eventId !== null) {
      conditions.push({ eventId });
    }

    if (cursorRegisteredAt !== null && cursorId !== null) {
      conditions.push({
        OR: [
          { registeredAt: { lt: cursorRegisteredAt } },
          { registeredAt: cursorRegisteredAt, id: { lt: cursorId } },
        ],
      });
    }

    return this.client.registration.findMany({
      where: { organizationId, participantId, AND: conditions },
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        eventId: true,
        ticketId: true,
        status: true,
        registeredAt: true,
        createdAt: true,
        event: { select: { name: true } },
        ticket: { select: { name: true } },
      },
    });
  }

  delete(participantId: string, tx: DatabaseClient = this.client): Promise<Participant> {
    return tx.participant.delete({ where: { id: participantId } });
  }
}
