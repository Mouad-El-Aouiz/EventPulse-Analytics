import type { RequestHandler } from 'express';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import { requestMetadata, requireActor } from '../../shared/http/request-context.js';
import type {
  AssignManagerBody,
  CreateEventBody,
  CreateTicketBody,
  EventListQuery,
  EventParams,
  TicketListQuery,
  TicketParams,
  UpdateEventBody,
  UpdateTicketBody,
} from './events.schemas.js';
import type { EventsService } from './events.service.js';
import type { TicketsService } from './tickets.service.js';

export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly tickets: TicketsService,
  ) {}

  readonly listEvents: RequestHandler = async (req, res) => {
    const page = await this.events.list(requireActor(req), req.query as unknown as EventListQuery);

    res.status(200).json(
      paginatedResponse(page.items, {
        limit: (req.query as unknown as EventListQuery).limit,
        nextCursor: page.nextCursor,
      }),
    );
  };

  readonly createEvent: RequestHandler = async (req, res) => {
    const event = await this.events.create(
      requireActor(req),
      req.body as CreateEventBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(event));
  };

  readonly getEvent: RequestHandler = async (req, res) => {
    const { eventId } = req.params as EventParams;
    const event = await this.events.get(requireActor(req), eventId);

    res.status(200).json(singleResponse(event));
  };

  readonly updateEvent: RequestHandler = async (req, res) => {
    const { eventId } = req.params as EventParams;
    const event = await this.events.update(
      requireActor(req),
      eventId,
      req.body as UpdateEventBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(event));
  };

  readonly deleteEvent: RequestHandler = async (req, res) => {
    const { eventId } = req.params as EventParams;
    await this.events.remove(requireActor(req), eventId, requestMetadata(req));

    res.status(204).send();
  };

  readonly transition = (
    action: 'publish' | 'start' | 'complete' | 'archive' | 'cancel',
  ): RequestHandler => {
    return async (req, res) => {
      const { eventId } = req.params as EventParams;
      const event = await this.events.transition(
        requireActor(req),
        eventId,
        action,
        requestMetadata(req),
      );

      res.status(200).json(singleResponse(event));
    };
  };

  readonly assignManager: RequestHandler = async (req, res) => {
    const { eventId } = req.params as EventParams;
    const event = await this.events.assignManager(
      requireActor(req),
      eventId,
      req.body as AssignManagerBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(event));
  };

  readonly listTickets: RequestHandler = async (req, res) => {
    const { eventId } = req.params as EventParams;
    const query = req.query as unknown as TicketListQuery;
    const page = await this.tickets.list(requireActor(req), eventId, query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };

  readonly createTicket: RequestHandler = async (req, res) => {
    const { eventId } = req.params as EventParams;
    const ticket = await this.tickets.create(
      requireActor(req),
      eventId,
      req.body as CreateTicketBody,
    );

    res.status(201).json(singleResponse(ticket));
  };

  readonly updateTicket: RequestHandler = async (req, res) => {
    const { eventId, ticketId } = req.params as TicketParams;
    const ticket = await this.tickets.update(
      requireActor(req),
      eventId,
      ticketId,
      req.body as UpdateTicketBody,
    );

    res.status(200).json(singleResponse(ticket));
  };

  readonly deleteTicket: RequestHandler = async (req, res) => {
    const { eventId, ticketId } = req.params as TicketParams;
    await this.tickets.remove(requireActor(req), eventId, ticketId);

    res.status(204).send();
  };
}
