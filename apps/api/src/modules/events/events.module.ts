import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { EventsController } from './events.controller.js';
import { EventsRepository } from './events.repository.js';
import { createEventsRouter } from './events.routes.js';
import { EventsService } from './events.service.js';
import { TicketsService } from './tickets.service.js';

export interface EventsModule {
  eventsRouter: ReturnType<typeof createEventsRouter>;
}

export function createEventsModule(auth: SharedAuthRuntime = getSharedAuthRuntime()): EventsModule {
  const client = getPrismaClient();
  const repository = new EventsRepository(client);
  const events = new EventsService({
    repository,
    audit: auth.audit,
    clock: auth.clock,
    logger,
  });
  const tickets = new TicketsService(repository, events);
  const controller = new EventsController(events, tickets);

  return {
    eventsRouter: createEventsRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
