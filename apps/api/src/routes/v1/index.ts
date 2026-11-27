import express, { type Router } from 'express';
import { createAuthRouter } from '../../modules/auth/auth.module.js';
import {
  createOrganizationsModule,
  type OrganizationsModule,
} from '../../modules/organizations/organizations.module.js';

export function createV1Router(): Router {
  const router = express.Router();
  let authRouter: Router | undefined;
  let organizationsModule: OrganizationsModule | undefined;

  // Modules own their Prisma resources and are initialized on first use so that
  // health checks and unrelated routes do not open database connections.
  router.use('/auth', (req, res, next) => {
    authRouter ??= createAuthRouter();
    authRouter(req, res, next);
  });

  router.use('/organizations', (req, res, next) => {
    organizationsModule ??= createOrganizationsModule();
    organizationsModule.organizationsRouter(req, res, next);
  });

  router.use('/invitations', (req, res, next) => {
    organizationsModule ??= createOrganizationsModule();
    organizationsModule.invitationsRouter(req, res, next);
  });

  return router;
}
