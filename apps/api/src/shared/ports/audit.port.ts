import type { AuditCategory, AuditResult } from '@prisma/client';

export interface AuditEvent {
  organizationId: string;
  actorUserId?: string | null;
  category: AuditCategory;
  actionType: string;
  resourceType: string;
  resourceId?: string | null;
  result: AuditResult;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditPort {
  record(event: AuditEvent): Promise<void>;
}
