import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { PrismaUnitOfWork } from '../../shared/database/database-client.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsRepository } from './transactions.repository.js';
import { createTransactionsRouter } from './transactions.routes.js';
import { TransactionsService } from './transactions.service.js';

export interface TransactionsModule {
  transactionsRouter: ReturnType<typeof createTransactionsRouter>;
}

export function createTransactionsModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): TransactionsModule {
  const client = getPrismaClient();
  const service = new TransactionsService({
    repository: new TransactionsRepository(client),
    unitOfWork: new PrismaUnitOfWork(client),
    audit: auth.audit,
    clock: auth.clock,
    logger,
  });
  const controller = new TransactionsController(service);

  return {
    transactionsRouter: createTransactionsRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
