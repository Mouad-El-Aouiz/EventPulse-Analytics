import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { RefundsController } from './refunds.controller.js';
import { refundListQuerySchema, refundParamsSchema } from './refunds.schemas.js';

export interface RefundsRoutesDependencies {
  controller: RefundsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createRefundsRouter(deps: RefundsRoutesDependencies): Router {
  const router = express.Router();
  const financeReaders = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get(
    '/',
    financeReaders,
    validateRequest({ query: refundListQuerySchema }),
    deps.controller.listRefunds,
  );
  router.get(
    '/:refundId',
    financeReaders,
    validateRequest({ params: refundParamsSchema }),
    deps.controller.getRefund,
  );

  return router;
}
