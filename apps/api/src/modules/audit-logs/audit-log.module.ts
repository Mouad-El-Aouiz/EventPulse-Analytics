import { getPrismaClient } from '../../database/prisma.js';
import { getSharedAuthRuntime, type SharedAuthRuntime } from '../auth/auth.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { createAuditLogRouter } from './audit-log.routes.js';
import { AuditLogService } from './audit-log.service.js';

export interface AuditLogModule {
  auditLogRouter: ReturnType<typeof createAuditLogRouter>;
}

export function createAuditLogModule(
  auth: SharedAuthRuntime = getSharedAuthRuntime(),
): AuditLogModule {
  const repository = new AuditLogRepository(getPrismaClient());
  const service = new AuditLogService(repository);
  const controller = new AuditLogController(service);

  return {
    auditLogRouter: createAuditLogRouter({
      controller,
      authenticate: auth.authenticate,
      tenantContext: auth.tenantContext,
      userRateLimit: auth.userRateLimit,
    }),
  };
}
