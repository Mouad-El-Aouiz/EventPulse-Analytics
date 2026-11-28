import { z } from 'zod';

export const AUDIT_CATEGORIES = [
  'AUTH',
  'USERS_ROLES',
  'ORGANIZATION',
  'SENSITIVE_DATA',
  'FINANCIAL',
  'INGESTION',
] as const;

export const AUDIT_RESULTS = ['SUCCESS', 'FAILURE'] as const;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const auditLogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    category: z.enum(AUDIT_CATEGORIES).optional(),
    actorUserId: z.string().uuid().optional(),
    actionType: z.string().trim().min(1).max(80).optional(),
    resourceType: z.string().trim().min(1).max(50).optional(),
    resourceId: z.string().trim().min(1).max(200).optional(),
    result: z.enum(AUDIT_RESULTS).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from !== undefined && value.to !== undefined && value.from >= value.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: '"to" must be greater than "from".',
      });
    }
  });

export const auditLogParamsSchema = z
  .object({
    auditLogId: z.string().uuid(),
  })
  .strict();

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditLogParams = z.infer<typeof auditLogParamsSchema>;
