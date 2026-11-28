import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { CheckInsController } from './check-ins.controller.js';
import {
  checkInListQuerySchema,
  checkInParamsSchema,
  createCheckInBodySchema,
} from './check-ins.schemas.js';

export interface CheckInsRoutesDependencies {
  controller: CheckInsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createCheckInsRouter(deps: CheckInsRoutesDependencies): Router {
  const router = express.Router();
  const accessOperators = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get(
    '/',
    accessOperators,
    validateRequest({ query: checkInListQuerySchema }),
    deps.controller.listCheckIns,
  );
  router.post(
    '/',
    accessOperators,
    validateRequest({ body: createCheckInBodySchema }),
    deps.controller.createCheckIn,
  );
  router.get(
    '/:checkInId',
    accessOperators,
    validateRequest({ params: checkInParamsSchema }),
    deps.controller.getCheckIn,
  );

  return router;
}
