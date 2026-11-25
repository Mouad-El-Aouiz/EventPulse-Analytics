import type { PrismaClient } from '@prisma/client';
import type { AuditEvent, AuditPort } from '../../shared/ports/audit.port.js';

const MAX_METADATA_BYTES = 8192;
const MAX_ACTION_TYPE_LENGTH = 80;
const MAX_RESOURCE_TYPE_LENGTH = 50;

function boundedMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (metadata === undefined) {
    return {};
  }

  const serialized = JSON.stringify(metadata);

  if (Buffer.byteLength(serialized, 'utf8') <= MAX_METADATA_BYTES) {
    return metadata;
  }

  return { truncated: true };
}

export class PrismaAuditWriter implements AuditPort {
  constructor(private readonly client: PrismaClient) {}

  async record(event: AuditEvent): Promise<void> {
    await this.client.auditLog.create({
      data: {
        organizationId: event.organizationId,
        category: event.category,
        actorUserId: event.actorUserId ?? null,
        actionType: event.actionType.slice(0, MAX_ACTION_TYPE_LENGTH),
        resourceType: event.resourceType.slice(0, MAX_RESOURCE_TYPE_LENGTH),
        resourceId: event.resourceId ?? null,
        result: event.result,
        metadata: boundedMetadata(event.metadata) as never,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  }
}
