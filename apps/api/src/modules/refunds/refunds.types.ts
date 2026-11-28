import type { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { formatMoney } from '../../shared/finance/money.js';

export type RefundSortField = 'refundedAt' | 'createdAt' | 'amount';

export interface RefundSort {
  field: RefundSortField;
  direction: 'asc' | 'desc';
}

export interface RefundListFilters {
  eventId?: string;
  transactionId?: string;
  from?: Date;
  to?: Date;
  managerScope?: { eventId: string; membershipId: string };
}

export interface RefundListOptions {
  filters: RefundListFilters;
  sort: RefundSort;
  limit: number;
  cursor: { value: string; id: string } | null;
}

export const REFUND_INCLUDE = {
  transaction: {
    select: {
      id: true,
      type: true,
      eventId: true,
      status: true,
      amount: true,
      event: { select: { id: true, name: true, managerMembershipId: true } },
    },
  },
} satisfies Prisma.RefundInclude;

export type RefundRecord = Prisma.RefundGetPayload<{ include: typeof REFUND_INCLUDE }>;

export interface RefundView {
  id: string;
  transactionId: string;
  amount: string;
  currency: string;
  refundedAt: Date;
  reason: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  transaction: {
    id: string;
    type: TransactionType;
    eventId: string;
    status: TransactionStatus;
    amount: string;
    event: { id: string; name: string };
  };
}

export function toRefundView(refund: RefundRecord): RefundView {
  return {
    id: refund.id,
    transactionId: refund.transactionId,
    amount: formatMoney(refund.amount),
    currency: refund.currency,
    refundedAt: refund.refundedAt,
    reason: refund.reason,
    createdByUserId: refund.createdByUserId,
    createdAt: refund.createdAt,
    transaction: {
      id: refund.transaction.id,
      type: refund.transaction.type,
      eventId: refund.transaction.eventId,
      status: refund.transaction.status,
      amount: formatMoney(refund.transaction.amount),
      event: {
        id: refund.transaction.event.id,
        name: refund.transaction.event.name,
      },
    },
  };
}
