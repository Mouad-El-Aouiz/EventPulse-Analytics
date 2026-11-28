import { forbiddenError } from '../../shared/http/authorization.js';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import { MONEY_PATTERN, formatMoney } from '../../shared/finance/money.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import { eventNotFoundError } from '../events/events.errors.js';
import type { Page } from '../events/events.service.js';
import { refundEventRequiredError, refundNotFoundError } from './refunds.errors.js';
import type { RefundsRepository } from './refunds.repository.js';
import type { RefundListQuery } from './refunds.schemas.js';
import {
  toRefundView,
  type RefundRecord,
  type RefundSort,
  type RefundView,
} from './refunds.types.js';

export interface RefundsServiceOptions {
  repository: RefundsRepository;
}

function parseSort(value: string): RefundSort {
  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = (direction === 'desc' ? value.slice(1) : value) as RefundSort['field'];

  return { field, direction };
}

export class RefundsService {
  constructor(private readonly options: RefundsServiceOptions) {}

  async list(actor: ActorContext, query: RefundListQuery): Promise<Page<RefundView>> {
    const eventId = query.eventId;
    let managerScope: { eventId: string; membershipId: string } | undefined;

    if (actor.role === 'EVENT_MANAGER') {
      if (eventId === undefined) {
        throw refundEventRequiredError();
      }

      const event = await this.options.repository.findEvent(actor.organizationId, eventId);

      if (event === null) {
        throw eventNotFoundError();
      }

      this.assertEventManagerScope(actor, event.managerMembershipId);
      managerScope = { eventId, membershipId: actor.membershipId };
    }

    const sort = parseSort(query.sort);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    this.validateCursor(sort, cursor);

    const rows = await this.options.repository.list(actor.organizationId, {
      filters: {
        eventId,
        transactionId: query.transactionId,
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
      items: page.map(toRefundView),
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(this.sortValue(last, sort), last.id) : null,
    };
  }

  async get(actor: ActorContext, refundId: string): Promise<RefundView> {
    const refund = await this.options.repository.findById(actor.organizationId, refundId);

    if (refund === null) {
      throw refundNotFoundError();
    }

    this.assertEventManagerScope(actor, refund.transaction.event.managerMembershipId);

    return toRefundView(refund);
  }

  private validateCursor(sort: RefundSort, cursor: { value: string; id: string } | null): void {
    if (cursor === null) {
      return;
    }

    if (sort.field === 'amount') {
      if (!MONEY_PATTERN.test(cursor.value)) {
        throw cursorInvalidError();
      }

      return;
    }

    if (Number.isNaN(new Date(cursor.value).getTime())) {
      throw cursorInvalidError();
    }
  }

  private sortValue(refund: RefundRecord, sort: RefundSort): string {
    switch (sort.field) {
      case 'amount':
        return formatMoney(refund.amount);
      case 'createdAt':
        return refund.createdAt.toISOString();
      case 'refundedAt':
        return refund.refundedAt.toISOString();
    }
  }

  private assertEventManagerScope(actor: ActorContext, managerMembershipId: string | null): void {
    if (actor.role === 'EVENT_MANAGER' && managerMembershipId !== actor.membershipId) {
      throw forbiddenError();
    }
  }
}
