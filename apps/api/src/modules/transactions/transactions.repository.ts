import type {
  BoothReservation,
  Event,
  Prisma,
  PrismaClient,
  Registration,
  TransactionStatus,
} from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type { RefundRecord } from '../refunds/refunds.types.js';
import { REFUND_INCLUDE } from '../refunds/refunds.types.js';
import type {
  TransactionListOptions,
  TransactionRecord,
  TransactionSort,
} from './transactions.types.js';
import { TRANSACTION_INCLUDE } from './transactions.types.js';

export interface TransactionCreateData {
  organizationId: string;
  eventId: string;
  type: 'TICKET' | 'BOOTH';
  amount: string;
  registrationId?: string;
  boothReservationId?: string;
}

export interface RefundCreateData {
  organizationId: string;
  transactionId: string;
  amount: string;
  reason: string | null;
  createdByUserId: string;
}

export interface LockedTransaction {
  id: string;
  status: TransactionStatus;
  amount: string;
}

function cursorWhere(
  sort: TransactionSort,
  cursor: { value: string; id: string },
): Prisma.TransactionWhereInput {
  const ascending = sort.direction === 'asc';

  if (sort.field === 'createdAt') {
    const value = new Date(cursor.value);

    return ascending
      ? {
          OR: [{ createdAt: { gt: value } }, { createdAt: value, id: { gt: cursor.id } }],
        }
      : {
          OR: [{ createdAt: { lt: value } }, { createdAt: value, id: { lt: cursor.id } }],
        };
  }

  if (sort.field === 'amount') {
    return ascending
      ? {
          OR: [{ amount: { gt: cursor.value } }, { amount: cursor.value, id: { gt: cursor.id } }],
        }
      : {
          OR: [{ amount: { lt: cursor.value } }, { amount: cursor.value, id: { lt: cursor.id } }],
        };
  }

  if (cursor.value === 'NULL') {
    return ascending
      ? { paidAt: null, id: { gt: cursor.id } }
      : { paidAt: null, id: { lt: cursor.id } };
  }

  const value = new Date(cursor.value);
  const comparisons: Prisma.TransactionWhereInput[] = ascending
    ? [{ paidAt: { gt: value } }, { paidAt: value, id: { gt: cursor.id } }]
    : [{ paidAt: { lt: value } }, { paidAt: value, id: { lt: cursor.id } }];

  return { OR: [...comparisons, { paidAt: null }] };
}

function orderBy(sort: TransactionSort): Prisma.TransactionOrderByWithRelationInput[] {
  if (sort.field === 'paidAt') {
    return [{ paidAt: { sort: sort.direction, nulls: 'last' } }, { id: sort.direction }];
  }

  return [{ [sort.field]: sort.direction }, { id: sort.direction }];
}

export class TransactionsRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: TransactionListOptions): Promise<TransactionRecord[]> {
    const conditions: Prisma.TransactionWhereInput[] = [];
    const { filters } = options;

    if (filters.managerScope !== undefined) {
      conditions.push({
        eventId: filters.managerScope.eventId,
        event: { managerMembershipId: filters.managerScope.membershipId },
      });
    } else if (filters.eventId !== undefined) {
      conditions.push({ eventId: filters.eventId });
    }

    if (filters.types !== undefined) {
      conditions.push({ type: { in: filters.types } });
    }

    if (filters.statuses !== undefined) {
      conditions.push({ status: { in: filters.statuses } });
    }

    if (filters.registrationId !== undefined) {
      conditions.push({ registrationId: filters.registrationId });
    }

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        paidAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (options.cursor !== null) {
      conditions.push(cursorWhere(options.sort, options.cursor));
    }

    return this.client.transaction.findMany({
      where: { organizationId, AND: conditions },
      include: TRANSACTION_INCLUDE,
      orderBy: orderBy(options.sort),
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    transactionId: string,
    tx: DatabaseClient = this.client,
  ): Promise<TransactionRecord | null> {
    return tx.transaction.findFirst({
      where: { id: transactionId, organizationId },
      include: TRANSACTION_INCLUDE,
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

  findRegistration(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<Registration | null> {
    return tx.registration.findFirst({
      where: { id: registrationId, organizationId },
    });
  }

  findBoothReservation(
    organizationId: string,
    boothReservationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<BoothReservation | null> {
    return tx.boothReservation.findFirst({
      where: { id: boothReservationId, organizationId },
    });
  }

  async ticketTransactionExists(
    organizationId: string,
    registrationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<boolean> {
    const count = await tx.transaction.count({
      where: { organizationId, registrationId, type: 'TICKET' },
    });

    return count > 0;
  }

  async boothTransactionExists(
    organizationId: string,
    boothReservationId: string,
    tx: DatabaseClient = this.client,
  ): Promise<boolean> {
    const count = await tx.transaction.count({
      where: { organizationId, boothReservationId, type: 'BOOTH' },
    });

    return count > 0;
  }

  create(
    data: TransactionCreateData,
    tx: DatabaseClient = this.client,
  ): Promise<TransactionRecord> {
    return tx.transaction.create({ data, include: TRANSACTION_INCLUDE });
  }

  updateStatus(
    organizationId: string,
    transactionId: string,
    status: TransactionStatus,
    paidAt: Date | null | undefined,
    tx: DatabaseClient = this.client,
  ): Promise<TransactionRecord> {
    return tx.transaction.update({
      where: { id: transactionId, organizationId },
      data: { status, paidAt },
      include: TRANSACTION_INCLUDE,
    });
  }

  async lockById(
    tx: DatabaseClient,
    organizationId: string,
    transactionId: string,
  ): Promise<LockedTransaction | null> {
    const rows = await tx.$queryRaw<
      Array<{ id: string; status: TransactionStatus; amount: string }>
    >`
      SELECT "id", "status", "amount"::text AS "amount"
      FROM "transactions"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "id" = ${transactionId}::uuid
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  async sumRefunds(
    tx: DatabaseClient,
    organizationId: string,
    transactionId: string,
  ): Promise<string> {
    const result = await tx.refund.aggregate({
      where: { organizationId, transactionId },
      _sum: { amount: true },
    });

    return result._sum.amount?.toFixed(2) ?? '0.00';
  }

  createRefund(data: RefundCreateData, tx: DatabaseClient = this.client): Promise<RefundRecord> {
    return tx.refund.create({ data, include: REFUND_INCLUDE });
  }

  findRefund(
    organizationId: string,
    refundId: string,
    tx: DatabaseClient = this.client,
  ): Promise<RefundRecord | null> {
    return tx.refund.findFirst({
      where: { id: refundId, organizationId },
      include: REFUND_INCLUDE,
    });
  }
}
