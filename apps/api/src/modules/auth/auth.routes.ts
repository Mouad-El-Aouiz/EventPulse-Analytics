import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  emptyBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
  sessionParamsSchema,
  switchOrganizationBodySchema,
} from './auth.schemas.js';
import type { AuthController } from './auth.controller.js';

export interface AuthRouteDependencies {
  controller: AuthController;
  authenticate: RequestHandler;
  optionalAuthenticate: RequestHandler;
  tenantContext: RequestHandler;
  requireOrigin: RequestHandler;
  userRateLimit: RequestHandler;
}

export function createAuthRouter(dependencies: AuthRouteDependencies): Router {
  const router = express.Router();
  const { controller } = dependencies;

  // Authentication responses carry tokens and session state and must never be
  // cached by browsers or intermediary proxies.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/login', validateRequest({ body: loginBodySchema }), controller.login);

  router.post(
    '/refresh',
    dependencies.requireOrigin,
    validateRequest({ body: emptyBodySchema }),
    controller.refresh,
  );

  router.post(
    '/logout',
    dependencies.optionalAuthenticate,
    validateRequest({ body: emptyBodySchema }),
    controller.logout,
  );

  router.post(
    '/logout-all',
    dependencies.authenticate,
    dependencies.userRateLimit,
    validateRequest({ body: emptyBodySchema }),
    controller.logoutAll,
  );

  router.get(
    '/me',
    dependencies.authenticate,
    dependencies.tenantContext,
    dependencies.userRateLimit,
    controller.me,
  );

  router.get(
    '/sessions',
    dependencies.authenticate,
    dependencies.tenantContext,
    dependencies.userRateLimit,
    controller.sessions,
  );

  router.delete(
    '/sessions/:sessionId',
    dependencies.authenticate,
    dependencies.tenantContext,
    dependencies.userRateLimit,
    validateRequest({ params: sessionParamsSchema }),
    controller.revokeSession,
  );

  router.post(
    '/switch-organization',
    dependencies.authenticate,
    dependencies.tenantContext,
    dependencies.userRateLimit,
    validateRequest({ body: switchOrganizationBodySchema }),
    controller.switchOrganization,
  );

  router.post(
    '/password/forgot',
    validateRequest({ body: forgotPasswordBodySchema }),
    controller.forgotPassword,
  );

  router.post(
    '/password/reset',
    validateRequest({ body: resetPasswordBodySchema }),
    controller.resetPassword,
  );

  return router;
}
