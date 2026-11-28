import type { AuditCategory, AuditResult } from '@prisma/client';

export interface AuditLogFilters {
  category?: AuditCategory;
  actorUserId?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
}

export interface AuditLogListOptions {
  filters: AuditLogFilters;
  limit: number;
  cursor: { createdAt: Date; id: string } | null;
}

export interface AuditLogView {
  id: string;
  category: AuditCategory;
  actorUserId: string | null;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  result: AuditResult;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
