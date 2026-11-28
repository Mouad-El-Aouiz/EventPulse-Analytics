import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { ParticipantsController } from './participants.controller.js';
import {
  createParticipantBodySchema,
  mergeParticipantsBodySchema,
  participantListQuerySchema,
  participantParamsSchema,
  participantRegistrationsQuerySchema,
  updateParticipantBodySchema,
} from './participants.schemas.js';

export interface ParticipantsRoutesDependencies {
  controller: ParticipantsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createParticipantsRouter(deps: ParticipantsRoutesDependencies): Router {
  const router = express.Router();
  const piiReaders = requireRole('OWNER', 'ADMIN', 'EVENT_MANAGER');
  const admins = requireRole('OWNER', 'ADMIN');

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get(
    '/',
    piiReaders,
    validateRequest({ query: participantListQuerySchema }),
    deps.controller.listParticipants,
  );
  router.post(
    '/',
    piiReaders,
    validateRequest({ body: createParticipantBodySchema }),
    deps.controller.createParticipant,
  );
  router.post(
    '/merge',
    admins,
    validateRequest({ body: mergeParticipantsBodySchema }),
    deps.controller.mergeParticipants,
  );
  router.get(
    '/:participantId',
    piiReaders,
    validateRequest({ params: participantParamsSchema }),
    deps.controller.getParticipant,
  );
  router.patch(
    '/:participantId',
    piiReaders,
    validateRequest({ params: participantParamsSchema, body: updateParticipantBodySchema }),
    deps.controller.updateParticipant,
  );
  router.delete(
    '/:participantId',
    admins,
    validateRequest({ params: participantParamsSchema }),
    deps.controller.deleteParticipant,
  );
  router.post(
    '/:participantId/anonymize',
    admins,
    validateRequest({ params: participantParamsSchema }),
    deps.controller.anonymizeParticipant,
  );
  router.post(
    '/:participantId/erase',
    admins,
    validateRequest({ params: participantParamsSchema }),
    deps.controller.eraseParticipant,
  );
  router.get(
    '/:participantId/registrations',
    piiReaders,
    validateRequest({
      params: participantParamsSchema,
      query: participantRegistrationsQuerySchema,
    }),
    deps.controller.listParticipantRegistrations,
  );

  return router;
}
