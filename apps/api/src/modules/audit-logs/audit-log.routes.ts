import express, { type RequestHandler, type Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { requireRole } from '../../shared/http/authorization.js';
import type { AuditLogController } from './audit-log.controller.js';
import { auditLogParamsSchema, auditLogQuerySchema } from './audit-log.schemas.js';

export interface AuditLogRoutesDependencies {
  controller: AuditLogController;
  authenticate: RequestHandler;
  tenantContext: RequestHandler;
  userRateLimit: RequestHandler;
}

function noStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function createAuditLogRouter(deps: AuditLogRoutesDependencies): Router {
  const router = express.Router();

  router.use(
    noStore,
    deps.authenticate,
    deps.tenantContext,
    deps.userRateLimit,
    requireRole('OWNER', 'ADMIN'),
  );

  router.get('/', validateRequest({ query: auditLogQuerySchema }), deps.controller.listAuditLogs);
  router.get(
    '/:auditLogId',
    validateRequest({ params: auditLogParamsSchema }),
    deps.controller.getAuditLog,
  );

  return router;
}
