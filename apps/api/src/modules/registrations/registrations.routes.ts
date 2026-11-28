import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { RegistrationsController } from './registrations.controller.js';
import {
  createRegistrationBodySchema,
  registrationListQuerySchema,
  registrationParamsSchema,
  updateRegistrationBodySchema,
} from './registrations.schemas.js';

export interface RegistrationsRoutesDependencies {
  controller: RegistrationsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createRegistrationsRouter(deps: RegistrationsRoutesDependencies): Router {
  const router = express.Router();
  const piiReaders = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');
  const writers = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');
  const admins = requireRole('OWNER', 'ADMIN');

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get(
    '/',
    piiReaders,
    validateRequest({ query: registrationListQuerySchema }),
    deps.controller.listRegistrations,
  );
  router.post(
    '/',
    writers,
    validateRequest({ body: createRegistrationBodySchema }),
    deps.controller.createRegistration,
  );
  router.get(
    '/:registrationId',
    piiReaders,
    validateRequest({ params: registrationParamsSchema }),
    deps.controller.getRegistration,
  );
  router.patch(
    '/:registrationId',
    writers,
    validateRequest({ params: registrationParamsSchema, body: updateRegistrationBodySchema }),
    deps.controller.updateRegistration,
  );
  router.post(
    '/:registrationId/confirm',
    writers,
    validateRequest({ params: registrationParamsSchema }),
    deps.controller.confirmRegistration,
  );
  router.post(
    '/:registrationId/cancel',
    writers,
    validateRequest({ params: registrationParamsSchema }),
    deps.controller.cancelRegistration,
  );
  router.delete(
    '/:registrationId',
    admins,
    validateRequest({ params: registrationParamsSchema }),
    deps.controller.deleteRegistration,
  );

  return router;
}
