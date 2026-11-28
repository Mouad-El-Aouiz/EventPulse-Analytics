import type { Event, Prisma, PrismaClient } from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type { RefundListOptions, RefundRecord, RefundSort } from './refunds.types.js';
import { REFUND_INCLUDE } from './refunds.types.js';

function cursorWhere(
  sort: RefundSort,
  cursor: { value: string; id: string },
): Prisma.RefundWhereInput {
  const ascending = sort.direction === 'asc';

  if (sort.field === 'amount') {
    return ascending
      ? {
          OR: [{ amount: { gt: cursor.value } }, { amount: cursor.value, id: { gt: cursor.id } }],
        }
      : {
          OR: [{ amount: { lt: cursor.value } }, { amount: cursor.value, id: { lt: cursor.id } }],
        };
  }

  const field = sort.field === 'createdAt' ? 'createdAt' : 'refundedAt';
  const value = new Date(cursor.value);

  return ascending
    ? {
        OR: [{ [field]: { gt: value } }, { [field]: value, id: { gt: cursor.id } }],
      }
    : {
        OR: [{ [field]: { lt: value } }, { [field]: value, id: { lt: cursor.id } }],
      };
}

function orderBy(sort: RefundSort): Prisma.RefundOrderByWithRelationInput[] {
  return [{ [sort.field]: sort.direction }, { id: sort.direction }];
}

export class RefundsRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: RefundListOptions): Promise<RefundRecord[]> {
    const conditions: Prisma.RefundWhereInput[] = [];
    const { filters } = options;

    if (filters.managerScope !== undefined) {
      conditions.push({
        transaction: {
          eventId: filters.managerScope.eventId,
          event: { managerMembershipId: filters.managerScope.membershipId },
        },
      });
    } else if (filters.eventId !== undefined) {
      conditions.push({ transaction: { eventId: filters.eventId } });
    }

    if (filters.transactionId !== undefined) {
      conditions.push({ transactionId: filters.transactionId });
    }

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        refundedAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (options.cursor !== null) {
      conditions.push(cursorWhere(options.sort, options.cursor));
    }

    return this.client.refund.findMany({
      where: { organizationId, AND: conditions },
      include: REFUND_INCLUDE,
      orderBy: orderBy(options.sort),
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    refundId: string,
    tx: DatabaseClient = this.client,
  ): Promise<RefundRecord | null> {
    return tx.refund.findFirst({
      where: { id: refundId, organizationId },
      include: REFUND_INCLUDE,
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
}
