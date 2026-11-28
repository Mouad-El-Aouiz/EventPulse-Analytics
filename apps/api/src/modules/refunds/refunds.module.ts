import { getPrismaClient } from '../../database/prisma.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { RefundsController } from './refunds.controller.js';
import { RefundsRepository } from './refunds.repository.js';
import { createRefundsRouter } from './refunds.routes.js';
import { RefundsService } from './refunds.service.js';

export interface RefundsModule {
  refundsRouter: ReturnType<typeof createRefundsRouter>;
}

export function createRefundsModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): RefundsModule {
  const service = new RefundsService({
    repository: new RefundsRepository(getPrismaClient()),
  });
  const controller = new RefundsController(service);

  return {
    refundsRouter: createRefundsRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
