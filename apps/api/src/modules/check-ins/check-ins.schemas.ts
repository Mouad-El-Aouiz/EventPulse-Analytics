import { z } from 'zod';

export const CHECK_IN_STATUSES = ['VALID', 'INVALID'] as const;
export const CHECK_IN_REASONS = [
  'OUTSIDE_WINDOW',
  'DUPLICATE',
  'REGISTRATION_CANCELLED',
  'REGISTRATION_NOT_CONFIRMED',
  'REGISTRATION_NOT_FOUND',
  'PARTICIPANT_NOT_FOUND',
  'EVENT_NOT_FOUND',
  'EVENT_CANCELLED',
] as const;
export const CHECK_IN_SOURCES = ['MANUAL', 'CSV', 'INGESTION_API'] as const;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const checkInParamsSchema = z
  .object({
    checkInId: z.string().uuid(),
  })
  .strict();

export const createCheckInBodySchema = z
  .object({
    eventId: z.string().uuid(),
    participantId: z.string().uuid(),
    registrationId: z.string().uuid(),
    source: z.enum(CHECK_IN_SOURCES).default('MANUAL'),
    checkedInAt: dateSchema.optional(),
  })
  .strict();

const checkInSortSchema = z
  .enum(['checkedInAt', '-checkedInAt', 'createdAt', '-createdAt'])
  .default('-checkedInAt');

export const checkInListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    eventId: z.string().uuid().optional(),
    participantId: z.string().uuid().optional(),
    status: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(CHECK_IN_STATUSES)).min(1),
      )
      .optional(),
    reason: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(CHECK_IN_REASONS)).min(1),
      )
      .optional(),
    source: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(CHECK_IN_SOURCES)).min(1),
      )
      .optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sort: checkInSortSchema,
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

export type CreateCheckInBody = z.infer<typeof createCheckInBodySchema>;
export type CheckInListQuery = z.infer<typeof checkInListQuerySchema>;
export type CheckInParams = z.infer<typeof checkInParamsSchema>;
