import type { PrismaClient } from '@prisma/client';
import type { AuditEvent, AuditPort } from '../../shared/ports/audit.port.js';

const MAX_METADATA_BYTES = 8192;
const MAX_ACTION_TYPE_LENGTH = 80;
const MAX_RESOURCE_TYPE_LENGTH = 50;

const TRUNCATED_METADATA = { truncated: true } as const;

function boundedMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (metadata === undefined) {
    return {};
  }

  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(metadata);
  } catch {
    // Circular references, BigInt and throwing toJSON hooks must never break the
    // business operation: fall back to the bounded marker.
    return { ...TRUNCATED_METADATA };
  }

  if (serialized === undefined) {
    return { ...TRUNCATED_METADATA };
  }

  if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
    return { ...TRUNCATED_METADATA };
  }

  try {
    // Round-trip through JSON so Prisma only receives JSON-safe values
    // (undefined nested fields, Dates, class instances become plain data).
    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return { ...TRUNCATED_METADATA };
  }
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
