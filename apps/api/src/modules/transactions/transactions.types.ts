import type { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { formatMoney } from '../../shared/finance/money.js';

export type TransactionSortField = 'createdAt' | 'paidAt' | 'amount';

export interface TransactionSort {
  field: TransactionSortField;
  direction: 'asc' | 'desc';
}

export interface TransactionListFilters {
  eventId?: string;
  types?: TransactionType[];
  statuses?: TransactionStatus[];
  registrationId?: string;
  from?: Date;
  to?: Date;
  managerScope?: { eventId: string; membershipId: string };
}

export interface TransactionListOptions {
  filters: TransactionListFilters;
  sort: TransactionSort;
  limit: number;
  cursor: { value: string; id: string } | null;
}

export const TRANSACTION_INCLUDE = {
  event: { select: { id: true, name: true, managerMembershipId: true } },
  registration: { select: { id: true, participantId: true } },
  boothReservation: { select: { id: true, boothId: true, exhibitorId: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionRecord = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

export interface TransactionView {
  id: string;
  eventId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  currency: string;
  registrationId: string | null;
  boothReservationId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  event: { id: string; name: string };
  registration: { id: string; participantId: string } | null;
  boothReservation: { id: string; boothId: string; exhibitorId: string } | null;
}

export function toTransactionView(transaction: TransactionRecord): TransactionView {
  return {
    id: transaction.id,
    eventId: transaction.eventId,
    type: transaction.type,
    status: transaction.status,
    amount: formatMoney(transaction.amount),
    currency: transaction.currency,
    registrationId: transaction.registrationId,
    boothReservationId: transaction.boothReservationId,
    paidAt: transaction.paidAt,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    event: { id: transaction.event.id, name: transaction.event.name },
    registration: transaction.registration,
    boothReservation: transaction.boothReservation,
  };
}
