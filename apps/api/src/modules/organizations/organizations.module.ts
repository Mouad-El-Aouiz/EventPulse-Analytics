import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getPrismaClient } from '../../database/prisma.js';
import { createRateLimiter } from '../../shared/rate-limit/create-rate-limiter.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { createPublicInvitationRateLimitMiddleware } from './middleware/public-invitation-rate-limit.middleware.js';
import { ApiKeyService } from './services/api-key.service.js';
import { InvitationService } from './services/invitation.service.js';
import { MembershipService } from './services/membership.service.js';
import { OrganizationService } from './services/organization.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { PrismaOrganizationsFacade } from './organizations-reader.js';
import {
  createInvitationsAcceptRouter,
  createOrganizationsRouter,
} from './organizations.routes.js';
import { ApiKeyRepository } from './repositories/api-key.repository.js';
import { InvitationRepository } from './repositories/invitation.repository.js';
import { MembershipRepository } from './repositories/membership.repository.js';
import { OrganizationRepository } from './repositories/organization.repository.js';
import { PrismaOrganizationsUnitOfWork } from './repositories/organizations-unit-of-work.js';

const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface OrganizationsModule {
  organizationsRouter: ReturnType<typeof createOrganizationsRouter>;
  invitationsRouter: ReturnType<typeof createInvitationsAcceptRouter>;
}

export function createOrganizationsModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): OrganizationsModule {
  const client = getPrismaClient();
  const unitOfWork = new PrismaOrganizationsUnitOfWork(client);
  const facade = new PrismaOrganizationsFacade(client);

  const organizationRepository = new OrganizationRepository(client);
  const membershipRepository = new MembershipRepository(client);
  const invitationRepository = new InvitationRepository(client);
  const apiKeyRepository = new ApiKeyRepository(client);

  const organizations = new OrganizationService({
    organizations: organizationRepository,
    memberships: membershipRepository,
    unitOfWork,
    facade,
    audit: auth.audit,
    logger,
  });

  const memberships = new MembershipService({
    memberships: membershipRepository,
    organizations: organizationRepository,
    unitOfWork,
    auth: auth.facade,
    audit: auth.audit,
    clock: auth.clock,
    logger,
  });

  const invitations = new InvitationService({
    invitations: invitationRepository,
    memberships: membershipRepository,
    organizations: organizationRepository,
    facade,
    unitOfWork,
    auth: auth.facade,
    invitationAccounts: auth.invitationAccounts,
    mail: auth.mail,
    audit: auth.audit,
    clock: auth.clock,
    logger,
    tokenPepper: env.INVITATION_TOKEN_PEPPER,
    ttlSeconds: INVITATION_TTL_SECONDS,
  });

  const apiKeys = new ApiKeyService({
    apiKeys: apiKeyRepository,
    memberships: membershipRepository,
    organizations: organizationRepository,
    unitOfWork,
    audit: auth.audit,
    clock: auth.clock,
    logger,
    keyPepper: env.API_KEY_PEPPER,
  });

  const controller = new OrganizationsController({
    organizations,
    memberships,
    invitations,
    apiKeys,
    cookie: {
      secure: env.AUTH_COOKIE_SECURE,
      domain: env.AUTH_COOKIE_DOMAIN,
    },
  });

  const deps = {
    controller,
    authenticate: auth.authenticate,
    tenantContext: auth.tenantContext,
    userRateLimit: auth.userRateLimit,
    publicInvitationRateLimit: createPublicInvitationRateLimitMiddleware(
      createRateLimiter(),
      env.INVITATION_ACCEPT_MAX_ATTEMPTS,
      env.INVITATION_ACCEPT_WINDOW_SECONDS,
    ),
  };

  return {
    organizationsRouter: createOrganizationsRouter(deps),
    invitationsRouter: createInvitationsAcceptRouter(deps),
  };
}
