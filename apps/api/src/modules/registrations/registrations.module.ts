import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { RegistrationsController } from './registrations.controller.js';
import { RegistrationsRepository } from './registrations.repository.js';
import { createRegistrationsRouter } from './registrations.routes.js';
import { RegistrationsService } from './registrations.service.js';

export interface RegistrationsModule {
  registrationsRouter: ReturnType<typeof createRegistrationsRouter>;
}

export function createRegistrationsModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): RegistrationsModule {
  const repository = new RegistrationsRepository(getPrismaClient());
  const service = new RegistrationsService({
    repository,
    audit: auth.audit,
    clock: auth.clock,
    logger,
  });
  const controller = new RegistrationsController(service);

  return {
    registrationsRouter: createRegistrationsRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
