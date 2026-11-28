import { z } from 'zod';

export const GENDERS = ['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED', 'UNKNOWN'] as const;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const emailSchema = z.string().trim().toLowerCase().min(3).max(320).email();
const nameSchema = z.string().trim().min(1).max(100);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

export const participantParamsSchema = z
  .object({
    participantId: z.string().uuid(),
  })
  .strict();

export const createParticipantBodySchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    phone: optionalText(30),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    region: optionalText(100),
    city: optionalText(100),
    birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
  })
  .strict();

export const updateParticipantBodySchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: optionalText(30),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    region: optionalText(100),
    city: optionalText(100),
    birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const mergeParticipantsBodySchema = z
  .object({
    sourceParticipantId: z.string().uuid(),
    targetParticipantId: z.string().uuid(),
    confirm: z.literal(true),
  })
  .strict();

const participantSortSchema = z
  .enum(['lastName', '-lastName', 'createdAt', '-createdAt', 'email', '-email'])
  .default('-createdAt');

export const participantListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    eventId: z.string().uuid().optional(),
    q: z.string().trim().min(2).max(100).optional(),
    country: z.string().trim().length(2).toUpperCase().optional(),
    region: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sort: participantSortSchema,
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

export const participantRegistrationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    eventId: z.string().uuid().optional(),
  })
  .strict();

export type CreateParticipantBody = z.infer<typeof createParticipantBodySchema>;
export type UpdateParticipantBody = z.infer<typeof updateParticipantBodySchema>;
export type MergeParticipantsBody = z.infer<typeof mergeParticipantsBodySchema>;
export type ParticipantListQuery = z.infer<typeof participantListQuerySchema>;
export type ParticipantRegistrationsQuery = z.infer<typeof participantRegistrationsQuerySchema>;
export type ParticipantParams = z.infer<typeof participantParamsSchema>;
