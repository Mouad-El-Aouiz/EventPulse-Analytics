import type {
  CheckInReason,
  CheckInSource,
  Event,
  Participant,
  Prisma,
  PrismaClient,
  Registration,
} from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type { CheckInListOptions, CheckInRecord, CheckInSort } from './check-ins.types.js';
import { CHECK_IN_INCLUDE } from './check-ins.types.js';

export interface CheckInCreateData {
  organizationId: string;
  eventId: string | null;
  participantId: string | null;
  registrationId: string | null;
  status: 'VALID' | 'INVALID';
  reason: CheckInReason | null;
  source: CheckInSource;
  checkedInAt: Date;
  createdByUserId: string;
}

function cursorWhere(
  sort: CheckInSort,
  cursor: { value: string; id: string },
): Prisma.CheckInWhereInput {
  const ascending = sort.direction === 'asc';
  const field = sort.field === 'createdAt' ? 'createdAt' : 'checkedInAt';
  const value = new Date(cursor.value);

  return ascending
    ? {
        OR: [{ [field]: { gt: value } }, { [field]: value, id: { gt: cursor.id } }],
      }
    : {
        OR: [{ [field]: { lt: value } }, { [field]: value, id: { lt: cursor.id } }],
      };
}

function orderBy(sort: CheckInSort): Prisma.CheckInOrderByWithRelationInput[] {
  return [{ [sort.field]: sort.direction }, { id: sort.direction }];
}

export class CheckInsRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: CheckInListOptions): Promise<CheckInRecord[]> {
    const conditions: Prisma.CheckInWhereInput[] = [];
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

    if (filters.statuses !== undefined) {
      conditions.push({ status: { in: filters.statuses } });
    }

    if (filters.reasons !== undefined) {
      conditions.push({ reason: { in: filters.reasons } });
    }

    if (filters.sources !== undefined) {
      conditions.push({ source: { in: filters.sources } });
    }

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        checkedInAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (options.cursor !== null) {
      conditions.push(cursorWhere(options.sort, options.cursor));
    }

    return this.client.checkIn.findMany({
      where: { organizationId, AND: conditions },
      include: CHECK_IN_INCLUDE,
      orderBy: orderBy(options.sort),
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    checkInId: string,
    tx: DatabaseClient = this.client,
  ): Promise<CheckInRecord | null> {
    return tx.checkIn.findFirst({
      where: { id: checkInId, organizationId },
      include: CHECK_IN_INCLUDE,
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

  findRegistration(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Registration | null> {
    return tx.registration.findFirst({
      where: { id: registrationId, organizationId, deletedAt: null },
    });
  }

  async hasValidCheckIn(
    organizationId: string,
    eventId: string,
    participantId: string,
    tx: DatabaseClient = this.client,
  ): Promise<boolean> {
    const count = await tx.checkIn.count({
      where: { organizationId, eventId, participantId, status: 'VALID' },
    });

    return count > 0;
  }

  create(data: CheckInCreateData, tx: DatabaseClient = this.client): Promise<CheckInRecord> {
    return tx.checkIn.create({ data, include: CHECK_IN_INCLUDE });
  }
}
