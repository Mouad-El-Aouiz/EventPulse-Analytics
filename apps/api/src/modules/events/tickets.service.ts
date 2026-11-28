import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import { normalizeMoney } from '../../shared/finance/money.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import { ticketInUseError, ticketNotFoundError } from './events.errors.js';
import type { EventsRepository } from './events.repository.js';
import type { CreateTicketBody, TicketListQuery, UpdateTicketBody } from './events.schemas.js';
import type { EventsService, Page } from './events.service.js';
import { toTicketView, type TicketView } from './events.types.js';

export class TicketsService {
  constructor(
    private readonly repository: EventsRepository,
    private readonly events: EventsService,
  ) {}

  async list(
    actor: ActorContext,
    eventId: string,
    query: TicketListQuery,
  ): Promise<Page<TicketView>> {
    await this.events.getReadableEvent(actor, eventId);

    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const createdAt = cursor === null ? null : new Date(cursor.value);

    if (createdAt !== null && Number.isNaN(createdAt.getTime())) {
      throw cursorInvalidError();
    }

    const rows = await this.repository.listTickets(
      actor.organizationId,
      eventId,
      query.limit,
      createdAt,
      cursor?.id ?? null,
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toTicketView),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(actor: ActorContext, eventId: string, body: CreateTicketBody): Promise<TicketView> {
    await this.events.getWritableEvent(actor, eventId);

    const ticket = await this.repository.createTicket({
      organizationId: actor.organizationId,
      eventId,
      name: body.name,
      priceAmount: normalizeMoney(body.priceAmount),
    });

    return toTicketView(ticket);
  }

  async update(
    actor: ActorContext,
    eventId: string,
    ticketId: string,
    body: UpdateTicketBody,
  ): Promise<TicketView> {
    await this.events.getWritableEvent(actor, eventId);

    const ticket = await this.repository.findTicket(actor.organizationId, eventId, ticketId);

    if (ticket === null) {
      throw ticketNotFoundError();
    }

    const updated = await this.repository.updateTicket(actor.organizationId, ticketId, {
      name: body.name,
      priceAmount: body.priceAmount === undefined ? undefined : normalizeMoney(body.priceAmount),
    });

    return toTicketView(updated);
  }

  async remove(actor: ActorContext, eventId: string, ticketId: string): Promise<void> {
    await this.events.getWritableEvent(actor, eventId);

    const ticket = await this.repository.findTicket(actor.organizationId, eventId, ticketId);

    if (ticket === null) {
      throw ticketNotFoundError();
    }

    const registrations = await this.repository.countTicketRegistrations(
      actor.organizationId,
      ticketId,
    );

    if (registrations > 0) {
      throw ticketInUseError();
    }

    await this.repository.updateTicket(actor.organizationId, ticketId, {
      deletedAt: new Date(),
    });
  }
}
