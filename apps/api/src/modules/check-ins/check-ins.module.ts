import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { CheckInsController } from './check-ins.controller.js';
import { CheckInsRepository } from './check-ins.repository.js';
import { createCheckInsRouter } from './check-ins.routes.js';
import { CheckInsService } from './check-ins.service.js';

export interface CheckInsModule {
  checkInsRouter: ReturnType<typeof createCheckInsRouter>;
}

export function createCheckInsModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): CheckInsModule {
  const service = new CheckInsService({
    repository: new CheckInsRepository(getPrismaClient()),
    audit: auth.audit,
    clock: auth.clock,
    logger,
  });
  const controller = new CheckInsController(service);

  return {
    checkInsRouter: createCheckInsRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
