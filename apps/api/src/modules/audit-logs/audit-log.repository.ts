import type { AuditLog, Prisma, PrismaClient } from '@prisma/client';
import type { DatabaseClient } from '../../shared/database/database-client.js';
import type { AuditLogListOptions } from './audit-log.types.js';

export class AuditLogRepository {
  constructor(private readonly client: PrismaClient) {}

  list(organizationId: string, options: AuditLogListOptions): Promise<AuditLog[]> {
    const conditions: Prisma.AuditLogWhereInput[] = [];
    const { filters, cursor } = options;

    if (filters.from !== undefined || filters.to !== undefined) {
      conditions.push({
        createdAt: {
          ...(filters.from === undefined ? {} : { gte: filters.from }),
          ...(filters.to === undefined ? {} : { lt: filters.to }),
        },
      });
    }

    if (cursor !== null) {
      conditions.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    return this.client.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.category === undefined ? {} : { category: filters.category }),
        ...(filters.actorUserId === undefined ? {} : { actorUserId: filters.actorUserId }),
        ...(filters.actionType === undefined ? {} : { actionType: filters.actionType }),
        ...(filters.resourceType === undefined ? {} : { resourceType: filters.resourceType }),
        ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
        ...(filters.result === undefined ? {} : { result: filters.result }),
        ...(conditions.length === 0 ? {} : { AND: conditions }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
    });
  }

  findById(
    organizationId: string,
    auditLogId: string,
    tx: DatabaseClient = this.client,
  ): Promise<AuditLog | null> {
    return tx.auditLog.findFirst({
      where: { id: auditLogId, organizationId },
    });
  }
}
