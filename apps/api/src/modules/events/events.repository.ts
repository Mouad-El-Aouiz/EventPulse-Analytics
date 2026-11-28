import type {
  Event,
  EventStatus,
  EventType,
  Membership,
  Prisma,
  PrismaClient,
  Ticket,
} from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type { EventListOptions, EventSort } from './events.types.js';

export interface EventCreateData {
  organizationId: string;
  name: string;
  type: EventType;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location: string | null;
  description: string | null;
  checkInOpensOffsetMinutes: number;
  checkInClosesOffsetMinutes: number;
  managerMembershipId: string | null;
}

export interface EventUpdateData {
  name?: string;
  type?: EventType;
  startAt?: Date;
  endAt?: Date;
  timezone?: string;
  location?: string | null;
  description?: string | null;
  checkInOpensOffsetMinutes?: number;
  checkInClosesOffsetMinutes?: number;
  status?: EventStatus;
  managerMembershipId?: string | null;
  deletedAt?: Date | null;
}

export interface TicketCreateData {
  organizationId: string;
  eventId: string;
  name: string;
  priceAmount: string;
}

export interface TicketUpdateData {
  name?: string;
  priceAmount?: string;
  deletedAt?: Date | null;
}

function cursorWhere(
  sort: EventSort,
  cursor: { value: string; id: string },
): Prisma.EventWhereInput {
  const ascending = sort.direction === 'asc';

  if (sort.field === 'name') {
    return ascending
      ? {
          OR: [{ name: { gt: cursor.value } }, { name: cursor.value, id: { gt: cursor.id } }],
        }
      : {
          OR: [{ name: { lt: cursor.value } }, { name: cursor.value, id: { lt: cursor.id } }],
        };
  }

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
        OR: [{ startAt: { gt: value } }, { startAt: value, id: { gt: cursor.id } }],
      }
    : {
        OR: [{ startAt: { lt: value } }, { startAt: value, id: { lt: cursor.id } }],
      };
}

export class EventsRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: EventListOptions): Promise<Event[]> {
    const conditions: Prisma.EventWhereInput[] = [{ deletedAt: null }];
    const { filters } = options;

    if (filters.statuses !== undefined) {
      conditions.push({ status: { in: filters.statuses } });
    }

    if (options.filters.managerScope !== undefined) {
      conditions.push({ managerMembershipId: filters.managerScope });
    } else if (filters.managerMembershipId !== undefined) {
      conditions.push({ managerMembershipId: filters.managerMembershipId });
    }

    if (filters.eventType !== undefined) {
      conditions.push({ type: filters.eventType });
    }

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        startAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (filters.q !== undefined) {
      conditions.push({ name: { contains: filters.q, mode: 'insensitive' } });
    }

    if (options.cursor !== null) {
      conditions.push(cursorWhere(options.sort, options.cursor));
    }

    const order: Prisma.EventOrderByWithRelationInput =
      options.sort.field === 'name'
        ? { name: options.sort.direction }
        : options.sort.field === 'createdAt'
          ? { createdAt: options.sort.direction }
          : { startAt: options.sort.direction };

    return this.client.event.findMany({
      where: { organizationId, AND: conditions },
      orderBy: [order, { id: options.sort.direction }],
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    eventId: string,
    tx: DatabaseClient = this.client,
    includeDeleted = false,
  ): Promise<Event | null> {
    return tx.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
  }

  create(data: EventCreateData, tx: DatabaseClient = this.client): Promise<Event> {
    return tx.event.create({ data });
  }

  update(
    organizationId: string,
    eventId: string,
    data: EventUpdateData,
    tx: DatabaseClient = this.client,
  ): Promise<Event> {
    return tx.event.update({ where: { id: eventId, organizationId }, data });
  }

  countRegistrations(
    organizationId: string,
    eventId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.registration.count({ where: { organizationId, eventId } });
  }

  findActiveEventManager(
    organizationId: string,
    membershipId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Membership | null> {
    return tx.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
        status: 'ACTIVE',
        role: 'EVENT_MANAGER',
      },
    });
  }

  listTickets(
    organizationId: string,
    eventId: string,
    limit: number,
    cursorCreatedAt: Date | null,
    cursorId: string | null,
  ): Promise<Ticket[]> {
    const conditions: Prisma.TicketWhereInput[] = [{ deletedAt: null }];

    if (cursorCreatedAt !== null && cursorId !== null) {
      conditions.push({
        OR: [
          { createdAt: { lt: cursorCreatedAt } },
          { createdAt: cursorCreatedAt, id: { lt: cursorId } },
        ],
      });
    }

    return this.client.ticket.findMany({
      where: { organizationId, eventId, AND: conditions },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  countTickets(
    organizationId: string,
    eventId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.ticket.count({ where: { organizationId, eventId, deletedAt: null } });
  }

  findTicket(
    organizationId: string,
    eventId: string,
    ticketId: string,
    tx: DatabaseClient = this.client,
    includeDeleted = false,
  ): Promise<Ticket | null> {
    return tx.ticket.findFirst({
      where: {
        id: ticketId,
        organizationId,
        eventId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
  }

  createTicket(data: TicketCreateData, tx: DatabaseClient = this.client): Promise<Ticket> {
    return tx.ticket.create({ data });
  }

  updateTicket(
    organizationId: string,
    ticketId: string,
    data: TicketUpdateData,
    tx: DatabaseClient = this.client,
  ): Promise<Ticket> {
    return tx.ticket.update({ where: { id: ticketId, organizationId }, data });
  }

  countTicketRegistrations(
    organizationId: string,
    ticketId: string,
    tx: DatabaseClient = this.client,
  ): Promise<number> {
    return tx.registration.count({ where: { organizationId, ticketId } });
  }
}
