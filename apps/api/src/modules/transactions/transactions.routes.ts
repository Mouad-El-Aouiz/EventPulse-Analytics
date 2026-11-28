import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { TransactionsController } from './transactions.controller.js';
import {
  createRefundBodySchema,
  createTransactionBodySchema,
  transactionListQuerySchema,
  transactionParamsSchema,
  updateTransactionBodySchema,
} from './transactions.schemas.js';

export interface TransactionsRoutesDependencies {
  controller: TransactionsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createTransactionsRouter(deps: TransactionsRoutesDependencies): Router {
  const router = express.Router();
  const financeWriters = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get(
    '/',
    financeWriters,
    validateRequest({ query: transactionListQuerySchema }),
    deps.controller.listTransactions,
  );
  router.post(
    '/',
    financeWriters,
    validateRequest({ body: createTransactionBodySchema }),
    deps.controller.createTransaction,
  );
  router.get(
    '/:transactionId',
    financeWriters,
    validateRequest({ params: transactionParamsSchema }),
    deps.controller.getTransaction,
  );
  router.patch(
    '/:transactionId',
    financeWriters,
    validateRequest({ params: transactionParamsSchema, body: updateTransactionBodySchema }),
    deps.controller.updateTransaction,
  );
  router.post(
    '/:transactionId/refunds',
    financeWriters,
    validateRequest({ params: transactionParamsSchema, body: createRefundBodySchema }),
    deps.controller.createRefund,
  );

  return router;
}
