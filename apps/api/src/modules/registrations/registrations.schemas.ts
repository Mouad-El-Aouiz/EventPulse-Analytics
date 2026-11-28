import { z } from 'zod';

export const REGISTRATION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLISTED'] as const;

export const REGISTRATION_SOURCES = [
  'MANUAL',
  'IMPORT',
  'INGESTION_API',
  'PARTNER',
  'OTHER',
] as const;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const registrationParamsSchema = z
  .object({
    registrationId: z.string().uuid(),
  })
  .strict();

export const createRegistrationBodySchema = z
  .object({
    eventId: z.string().uuid(),
    participantId: z.string().uuid(),
    ticketId: z.string().uuid(),
    source: z.enum(REGISTRATION_SOURCES).default('MANUAL'),
    sourceDetail: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const updateRegistrationBodySchema = z
  .object({
    status: z.enum(REGISTRATION_STATUSES).optional(),
    ticketId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

const registrationSortSchema = z
  .enum(['registeredAt', '-registeredAt', 'createdAt', '-createdAt'])
  .default('-registeredAt');

export const registrationListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    eventId: z.string().uuid().optional(),
    participantId: z.string().uuid().optional(),
    ticketId: z.string().uuid().optional(),
    status: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(REGISTRATION_STATUSES)).min(1),
      )
      .optional(),
    source: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(REGISTRATION_SOURCES)).min(1),
      )
      .optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sort: registrationSortSchema,
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

export type CreateRegistrationBody = z.infer<typeof createRegistrationBodySchema>;
export type UpdateRegistrationBody = z.infer<typeof updateRegistrationBodySchema>;
export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;
export type RegistrationParams = z.infer<typeof registrationParamsSchema>;
