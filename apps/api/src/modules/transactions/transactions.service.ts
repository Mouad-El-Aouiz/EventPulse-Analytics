import type { TransactionStatus } from '@prisma/client';
import type { Logger } from 'pino';
import { recordAuditBestEffort } from '../../shared/audit/best-effort-audit.js';
import { forbiddenError } from '../../shared/http/authorization.js';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import type { RequestMetadata } from '../../shared/http/request-context.js';
import {
  MONEY_PATTERN,
  formatMoney,
  moneyToCents,
  normalizeMoney,
} from '../../shared/finance/money.js';
import type { AuditPort } from '../../shared/ports/audit.port.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import type { PrismaUnitOfWork } from '../../shared/database/database-client.js';
import { eventNotFoundError } from '../events/events.errors.js';
import type { Page } from '../events/events.service.js';
import { toRefundView, type RefundRecord, type RefundView } from '../refunds/refunds.types.js';
import {
  refundExceedsAmountError,
  refundNotAllowedError,
  transactionDuplicateError,
  transactionEventRequiredError,
  transactionInvalidTransitionError,
  transactionNotFoundError,
  transactionReferenceError,
} from './transactions.errors.js';
import type { TransactionsRepository } from './transactions.repository.js';
import type {
  CreateRefundBody,
  CreateTransactionBody,
  TransactionListQuery,
  UpdateTransactionBody,
} from './transactions.schemas.js';
import {
  toTransactionView,
  type TransactionRecord,
  type TransactionSort,
  type TransactionView,
} from './transactions.types.js';

const MANUAL_TRANSITIONS: Partial<Record<TransactionStatus, TransactionStatus[]>> = {
  PENDING: ['PAID', 'FAILED', 'CANCELLED'],
};

export interface TransactionsServiceOptions {
  repository: TransactionsRepository;
  unitOfWork: PrismaUnitOfWork;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
}

function parseSort(value: string): TransactionSort {
  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = (direction === 'desc' ? value.slice(1) : value) as TransactionSort['field'];

  return { field, direction };
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export class TransactionsService {
  constructor(private readonly options: TransactionsServiceOptions) {}

  async list(actor: ActorContext, query: TransactionListQuery): Promise<Page<TransactionView>> {
    const eventId = query.eventId;
    let managerScope: { eventId: string; membershipId: string } | undefined;

    if (actor.role === 'EVENT_MANAGER') {
      if (eventId === undefined) {
        throw transactionEventRequiredError();
      }

      await this.assertManagedEvent(actor, eventId);
      managerScope = { eventId, membershipId: actor.membershipId };
    }

    const sort = parseSort(query.sort);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    this.validateCursor(sort, cursor);

    const rows = await this.options.repository.list(actor.organizationId, {
      filters: {
        eventId,
        types: query.type,
        statuses: query.status,
        registrationId: query.registrationId,
        from: query.from,
        to: query.to,
        managerScope,
      },
      sort,
      limit: query.limit,
      cursor,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toTransactionView),
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(this.sortValue(last, sort), last.id) : null,
    };
  }

  async create(
    actor: ActorContext,
    body: CreateTransactionBody,
    metadata: RequestMetadata,
  ): Promise<TransactionView> {
    const event = await this.options.repository.findEvent(actor.organizationId, body.eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    this.assertEventManagerScope(actor, event.managerMembershipId);

    if (body.type === 'TICKET') {
      if (body.registrationId === undefined || body.boothReservationId !== undefined) {
        throw transactionReferenceError();
      }

      const registration = await this.options.repository.findRegistration(
        actor.organizationId,
        body.registrationId,
      );

      if (registration === null || registration.eventId !== body.eventId) {
        throw transactionReferenceError();
      }

      if (
        await this.options.repository.ticketTransactionExists(
          actor.organizationId,
          body.registrationId,
        )
      ) {
        throw transactionDuplicateError();
      }
    } else {
      if (body.boothReservationId === undefined || body.registrationId !== undefined) {
        throw transactionReferenceError();
      }

      const reservation = await this.options.repository.findBoothReservation(
        actor.organizationId,
        body.boothReservationId,
      );

      if (reservation === null || reservation.eventId !== body.eventId) {
        throw transactionReferenceError();
      }

      if (
        await this.options.repository.boothTransactionExists(
          actor.organizationId,
          body.boothReservationId,
        )
      ) {
        throw transactionDuplicateError();
      }
    }

    let transaction: TransactionRecord;

    try {
      transaction = await this.options.repository.create({
        organizationId: actor.organizationId,
        eventId: body.eventId,
        type: body.type,
        amount: normalizeMoney(body.amount),
        registrationId: body.registrationId,
        boothReservationId: body.boothReservationId,
      });
    } catch (error) {
      if (isErrorWithCode(error, 'P2002')) {
        throw transactionDuplicateError();
      }

      throw error;
    }

    await this.audit(actor, metadata, {
      actionType: 'TRANSACTION_RECORDED',
      resourceId: transaction.id,
      result: 'SUCCESS',
      metadata: {
        type: transaction.type,
        amount: formatMoney(transaction.amount),
        currency: transaction.currency,
      },
    });

    return toTransactionView(transaction);
  }

  async get(actor: ActorContext, transactionId: string): Promise<TransactionView> {
    return toTransactionView(await this.getScopedTransaction(actor, transactionId));
  }

  async updateStatus(
    actor: ActorContext,
    transactionId: string,
    body: UpdateTransactionBody,
    metadata: RequestMetadata,
  ): Promise<TransactionView> {
    const transaction = await this.getScopedTransaction(actor, transactionId);
    const allowed = MANUAL_TRANSITIONS[transaction.status] ?? [];

    if (!allowed.includes(body.status)) {
      await this.audit(actor, metadata, {
        actionType: 'TRANSACTION_STATUS_REJECTED',
        resourceId: transaction.id,
        result: 'FAILURE',
        metadata: {
          currentStatus: transaction.status,
          attemptedStatus: body.status,
        },
      });

      throw transactionInvalidTransitionError();
    }

    const updated = await this.options.repository.updateStatus(
      actor.organizationId,
      transactionId,
      body.status,
      body.status === 'PAID' ? this.options.clock.now() : undefined,
    );

    await this.audit(actor, metadata, {
      actionType: 'TRANSACTION_STATUS_UPDATED',
      resourceId: transaction.id,
      result: 'SUCCESS',
      metadata: {
        previousStatus: transaction.status,
        nextStatus: body.status,
      },
    });

    return toTransactionView(updated);
  }

  async createRefund(
    actor: ActorContext,
    transactionId: string,
    body: CreateRefundBody,
    metadata: RequestMetadata,
  ): Promise<RefundView> {
    const transaction = await this.getScopedTransaction(actor, transactionId);

    if (transaction.status !== 'PAID' && transaction.status !== 'PARTIALLY_REFUNDED') {
      throw refundNotAllowedError();
    }

    const amount = normalizeMoney(body.amount);
    let refund: RefundRecord | null;

    try {
      refund = await this.options.unitOfWork.run(async (tx) => {
        const locked = await this.options.repository.lockById(
          tx,
          actor.organizationId,
          transactionId,
        );

        if (locked === null) {
          throw transactionNotFoundError();
        }

        if (locked.status !== 'PAID' && locked.status !== 'PARTIALLY_REFUNDED') {
          throw refundNotAllowedError();
        }

        const refunded = await this.options.repository.sumRefunds(
          tx,
          actor.organizationId,
          transactionId,
        );
        const totalCents = moneyToCents(amount) + moneyToCents(refunded);
        const paidCents = moneyToCents(locked.amount);

        if (totalCents > paidCents) {
          throw refundExceedsAmountError();
        }

        const created = await this.options.repository.createRefund(
          {
            organizationId: actor.organizationId,
            transactionId,
            amount,
            reason: body.reason ?? null,
            createdByUserId: actor.userId,
          },
          tx,
        );

        await this.options.repository.updateStatus(
          actor.organizationId,
          transactionId,
          totalCents === paidCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          undefined,
          tx,
        );

        return this.options.repository.findRefund(actor.organizationId, created.id, tx);
      });
    } catch (error) {
      if (isErrorWithCode(error, 'P2004') || isErrorWithCode(error, 'P2010')) {
        throw refundExceedsAmountError();
      }

      throw error;
    }

    if (refund === null) {
      throw transactionNotFoundError();
    }

    await this.audit(actor, metadata, {
      actionType: 'REFUND_RECORDED',
      resourceId: refund.id,
      result: 'SUCCESS',
      metadata: {
        transactionId,
        amount,
        resultingStatus: refund.transaction.status,
      },
    });

    return toRefundView(refund);
  }

  private validateCursor(
    sort: TransactionSort,
    cursor: { value: string; id: string } | null,
  ): void {
    if (cursor === null) {
      return;
    }

    if (sort.field === 'amount') {
      if (!MONEY_PATTERN.test(cursor.value)) {
        throw cursorInvalidError();
      }

      return;
    }

    if (sort.field === 'paidAt' && cursor.value === 'NULL') {
      return;
    }

    if (Number.isNaN(new Date(cursor.value).getTime())) {
      throw cursorInvalidError();
    }
  }

  private sortValue(transaction: TransactionRecord, sort: TransactionSort): string {
    switch (sort.field) {
      case 'amount':
        return formatMoney(transaction.amount);
      case 'createdAt':
        return transaction.createdAt.toISOString();
      case 'paidAt':
        return transaction.paidAt === null ? 'NULL' : transaction.paidAt.toISOString();
    }
  }

  private async getScopedTransaction(
    actor: ActorContext,
    transactionId: string,
  ): Promise<TransactionRecord> {
    const transaction = await this.options.repository.findById(actor.organizationId, transactionId);

    if (transaction === null) {
      throw transactionNotFoundError();
    }

    this.assertEventManagerScope(actor, transaction.event.managerMembershipId);

    return transaction;
  }

  private async assertManagedEvent(actor: ActorContext, eventId: string): Promise<void> {
    const event = await this.options.repository.findEvent(actor.organizationId, eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    this.assertEventManagerScope(actor, event.managerMembershipId);
  }

  private assertEventManagerScope(actor: ActorContext, managerMembershipId: string | null): void {
    if (actor.role === 'EVENT_MANAGER' && managerMembershipId !== actor.membershipId) {
      throw forbiddenError();
    }
  }

  private async audit(
    actor: ActorContext,
    metadata: RequestMetadata,
    event: {
      actionType: string;
      resourceId: string;
      result: 'SUCCESS' | 'FAILURE';
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await recordAuditBestEffort(this.options.audit, this.options.logger, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'FINANCIAL',
      actionType: event.actionType,
      resourceType: 'transaction',
      resourceId: event.resourceId,
      result: event.result,
      metadata: event.metadata,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
