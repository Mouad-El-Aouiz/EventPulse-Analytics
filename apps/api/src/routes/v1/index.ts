import express, { type Router } from 'express';
import { createAuthRouter } from '../../modules/auth/auth.module.js';

export function createV1Router(): Router {
  const router = express.Router();
  let authRouter: Router | undefined;

  // The module owns its Prisma client and is initialized on first use so that
  // health checks and routes unrelated to Auth do not open database resources.
  router.use('/auth', (req, res, next) => {
    authRouter ??= createAuthRouter();
    authRouter(req, res, next);
  });

  return router;
}
