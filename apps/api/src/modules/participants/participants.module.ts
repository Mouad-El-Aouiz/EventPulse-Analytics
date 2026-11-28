import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { PrismaUnitOfWork } from '../../shared/database/database-client.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { ParticipantsController } from './participants.controller.js';
import { ParticipantsRepository } from './participants.repository.js';
import { createParticipantsRouter } from './participants.routes.js';
import { ParticipantsService } from './participants.service.js';

export interface ParticipantsModule {
  participantsRouter: ReturnType<typeof createParticipantsRouter>;
}

export function createParticipantsModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): ParticipantsModule {
  const client = getPrismaClient();
  const repository = new ParticipantsRepository(client);
  const service = new ParticipantsService({
    repository,
    unitOfWork: new PrismaUnitOfWork(client),
    audit: auth.audit,
    clock: auth.clock,
    logger,
  });
  const controller = new ParticipantsController(service);

  return {
    participantsRouter: createParticipantsRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
