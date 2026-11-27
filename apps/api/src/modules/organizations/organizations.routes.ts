import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { OrganizationsController } from './organizations.controller.js';
import {
  acceptInvitationBodySchema,
  acceptInvitationWithTokenBodySchema,
  apiKeyParamsSchema,
  createApiKeyBodySchema,
  createInvitationBodySchema,
  invitationParamsSchema,
  membershipParamsSchema,
  updateMembershipBodySchema,
  updateOrganizationBodySchema,
  rotateApiKeyBodySchema,
} from './organizations.schemas.js';

export interface OrganizationsRoutesDependencies {
  controller: OrganizationsController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
  publicInvitationRateLimit: RequestHandler;
}

const ADMIN_ROLES = ['OWNER', 'ADMIN'] as const;

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createOrganizationsRouter(deps: OrganizationsRoutesDependencies): Router {
  const router = express.Router();
  const adminOnly = requireRole(...ADMIN_ROLES);

  router.use(noStore, deps.authenticate, deps.tenantContext, deps.userRateLimit);

  router.get('/', deps.controller.listOrganizations);
  router.get('/current', deps.controller.getCurrentOrganization);

  router.patch(
    '/current',
    adminOnly,
    validateRequest({ body: updateOrganizationBodySchema }),
    deps.controller.updateCurrentOrganization,
  );

  router.get('/current/members', adminOnly, deps.controller.listMembers);
  router.patch(
    '/current/members/:membershipId',
    adminOnly,
    validateRequest({ params: membershipParamsSchema, body: updateMembershipBodySchema }),
    deps.controller.updateMember,
  );
  router.delete(
    '/current/members/:membershipId',
    adminOnly,
    validateRequest({ params: membershipParamsSchema }),
    deps.controller.removeMember,
  );

  router.get('/current/invitations', adminOnly, deps.controller.listInvitations);
  router.post(
    '/current/invitations',
    adminOnly,
    validateRequest({ body: createInvitationBodySchema }),
    deps.controller.createInvitation,
  );
  router.delete(
    '/current/invitations/:invitationId',
    adminOnly,
    validateRequest({ params: invitationParamsSchema }),
    deps.controller.revokeInvitation,
  );

  router.get('/current/api-keys', adminOnly, deps.controller.listApiKeys);
  router.post(
    '/current/api-keys',
    adminOnly,
    validateRequest({ body: createApiKeyBodySchema }),
    deps.controller.createApiKey,
  );
  router.post(
    '/current/api-keys/:keyId/revoke',
    adminOnly,
    validateRequest({ params: apiKeyParamsSchema }),
    deps.controller.revokeApiKey,
  );
  router.post(
    '/current/api-keys/:keyId/rotate',
    adminOnly,
    validateRequest({ params: apiKeyParamsSchema, body: rotateApiKeyBodySchema }),
    deps.controller.rotateApiKey,
  );

  return router;
}

export function createInvitationsAcceptRouter(deps: OrganizationsRoutesDependencies): Router {
  const router = express.Router();

  router.use(noStore);
  router.post(
    '/accept-token',
    deps.publicInvitationRateLimit,
    validateRequest({ body: acceptInvitationWithTokenBodySchema }),
    deps.controller.acceptInvitationWithToken,
  );

  router.use(deps.authenticate, deps.userRateLimit);
  router.post(
    '/accept',
    validateRequest({ body: acceptInvitationBodySchema }),
    deps.controller.acceptInvitation,
  );

  return router;
}
