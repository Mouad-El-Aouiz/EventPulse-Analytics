import type { RequestHandler } from 'express';
import { requireActor } from '../../shared/http/request-context.js';
import type { AuditLogService } from './audit-log.service.js';
import type { AuditLogParams, AuditLogQuery } from './audit-log.schemas.js';

export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  readonly listAuditLogs: RequestHandler = async (req, res) => {
    const response = await this.service.list(
      requireActor(req),
      req.query as unknown as AuditLogQuery,
    );

    res.status(200).json(response);
  };

  readonly getAuditLog: RequestHandler = async (req, res) => {
    const { auditLogId } = req.params as unknown as AuditLogParams;
    const response = await this.service.get(requireActor(req), auditLogId);

    res.status(200).json(response);
  };
}
