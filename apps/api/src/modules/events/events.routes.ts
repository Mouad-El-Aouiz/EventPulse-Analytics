import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { EventsController } from './events.controller.js';
import {
  assignManagerBodySchema,
  createEventBodySchema,
  createTicketBodySchema,
  eventListQuerySchema,
  eventParamsSchema,
  ticketListQuerySchema,
  ticketParamsSchema,
  updateEventBodySchema,
  updateTicketBodySchema,
} from './events.schemas.js';

export interface EventsRoutesDependencies {
  controller: EventsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createEventsRouter(deps: EventsRoutesDependencies): Router {
  const router = express.Router();
  const allRoles = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER', 'ANALYST', 'VIEWER');
  const managers = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');
  const admins = requireRole('OWNER', 'ADMIN');

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get(
    '/',
    allRoles,
    validateRequest({ query: eventListQuerySchema }),
    deps.controller.listEvents,
  );
  router.post(
    '/',
    managers,
    validateRequest({ body: createEventBodySchema }),
    deps.controller.createEvent,
  );
  router.get(
    '/:eventId',
    allRoles,
    validateRequest({ params: eventParamsSchema }),
    deps.controller.getEvent,
  );
  router.patch(
    '/:eventId',
    managers,
    validateRequest({ params: eventParamsSchema, body: updateEventBodySchema }),
    deps.controller.updateEvent,
  );
  router.delete(
    '/:eventId',
    admins,
    validateRequest({ params: eventParamsSchema }),
    deps.controller.deleteEvent,
  );

  for (const action of ['publish', 'start', 'complete', 'archive', 'cancel'] as const) {
    router.post(
      `/:eventId/${action}`,
      managers,
      validateRequest({ params: eventParamsSchema }),
      deps.controller.transition(action),
    );
  }

  router.patch(
    '/:eventId/manager',
    admins,
    validateRequest({ params: eventParamsSchema, body: assignManagerBodySchema }),
    deps.controller.assignManager,
  );

  router.get(
    '/:eventId/tickets',
    managers,
    validateRequest({ params: eventParamsSchema, query: ticketListQuerySchema }),
    deps.controller.listTickets,
  );
  router.post(
    '/:eventId/tickets',
    managers,
    validateRequest({ params: eventParamsSchema, body: createTicketBodySchema }),
    deps.controller.createTicket,
  );
  router.patch(
    '/:eventId/tickets/:ticketId',
    managers,
    validateRequest({ params: ticketParamsSchema, body: updateTicketBodySchema }),
    deps.controller.updateTicket,
  );
  router.delete(
    '/:eventId/tickets/:ticketId',
    admins,
    validateRequest({ params: ticketParamsSchema }),
    deps.controller.deleteTicket,
  );

  return router;
}
