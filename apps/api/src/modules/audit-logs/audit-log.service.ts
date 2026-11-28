import type { AuditLog } from '@prisma/client';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import type { PaginatedResponse, SingleResponse } from '../../http/responses.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import type { AuditLogRepository } from './audit-log.repository.js';
import type { AuditLogQuery } from './audit-log.schemas.js';
import { auditLogNotFoundError } from './audit-log.errors.js';
import type { AuditLogView } from './audit-log.types.js';

const REDACTED = '[REDACTED]';
const MAX_METADATA_DEPTH = 8;
const MAX_METADATA_ENTRIES = 100;
const MAX_METADATA_STRING = 2_000;
const SENSITIVE_KEY_PATTERN =
  /pass(?:word)?|secret|token|authorization|cookie|api[-_]?key|key[-_]?hash/i;

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING ? `${value.slice(0, MAX_METADATA_STRING)}…` : value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_METADATA_ENTRIES).map((entry) => redactValue(entry, depth + 1));
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_METADATA_ENTRIES);

  return Object.fromEntries(
    entries.map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry, depth + 1),
    ]),
  );
}

function sanitizeMetadata(metadata: unknown): unknown {
  const redacted = redactValue(metadata, 0);
  return typeof redacted === 'object' && redacted !== null ? redacted : {};
}

function toView(log: AuditLog): AuditLogView {
  return {
    id: log.id,
    category: log.category,
    actorUserId: log.actorUserId,
    actionType: log.actionType,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    result: log.result,
    metadata: sanitizeMetadata(log.metadata),
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
  };
}

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async list(actor: ActorContext, query: AuditLogQuery): Promise<PaginatedResponse<AuditLogView>> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const cursorDate = cursor === null ? null : new Date(cursor.value);

    if (cursorDate !== null && Number.isNaN(cursorDate.getTime())) {
      throw cursorInvalidError();
    }

    const rows = await this.repository.list(actor.organizationId, {
      filters: {
        category: query.category,
        actorUserId: query.actorUserId,
        actionType: query.actionType,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        result: query.result,
        from: query.from,
        to: query.to,
      },
      limit: query.limit,
      cursor:
        cursorDate === null || cursor === null ? null : { createdAt: cursorDate, id: cursor.id },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last !== undefined ? encodeCursor(last.createdAt, last.id) : null;

    return paginatedResponse(page.map(toView), { limit: query.limit, nextCursor });
  }

  async get(actor: ActorContext, auditLogId: string): Promise<SingleResponse<AuditLogView>> {
    const log = await this.repository.findById(actor.organizationId, auditLogId);

    if (log === null) {
      throw auditLogNotFoundError();
    }

    return singleResponse(toView(log));
  }
}
