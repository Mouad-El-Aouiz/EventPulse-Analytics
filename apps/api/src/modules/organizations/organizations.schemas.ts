import { z } from 'zod';

const EMAIL_MAX_LENGTH = 320;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 150;

const emailSchema = z.string().trim().toLowerCase().min(3).max(EMAIL_MAX_LENGTH).email();

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid IANA timezone.' },
  );

const slugSchema = z.string().trim().toLowerCase().min(2).max(80).regex(SLUG_PATTERN, {
  message: 'Must contain lowercase letters, digits, and single hyphens only.',
});

export const updateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    slug: slugSchema.optional(),
    timezone: timezoneSchema.optional(),
    currency: z.literal('EUR').optional(),
    exportRetentionDays: z.number().int().min(1).max(365).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const membershipParamsSchema = z
  .object({
    membershipId: z.string().uuid(),
  })
  .strict();

export const invitationParamsSchema = z
  .object({
    invitationId: z.string().uuid(),
  })
  .strict();

export const apiKeyParamsSchema = z
  .object({
    keyId: z.string().uuid(),
  })
  .strict();

export const updateMembershipBodySchema = z
  .object({
    role: z.enum(['OWNER', 'ADMIN', 'EVENT_MANAGER', 'ANALYST', 'VIEWER']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const createInvitationBodySchema = z
  .object({
    email: emailSchema,
    role: z.enum(['OWNER', 'ADMIN', 'EVENT_MANAGER', 'ANALYST', 'VIEWER']),
  })
  .strict();

export const acceptInvitationBodySchema = z
  .object({
    token: z.string().min(20).max(512),
  })
  .strict();

export const acceptInvitationWithTokenBodySchema = z
  .object({
    token: z.string().min(20).max(512),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH).optional(),
  })
  .strict();

const apiKeyExpirySchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const createApiKeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    scopes: z
      .array(z.literal('ingestion:write'))
      .min(1)
      .refine((value) => new Set(value).size === value.length, {
        message: 'Scopes must not contain duplicates.',
      })
      .default(['ingestion:write']),
    expiresAt: apiKeyExpirySchema.optional(),
  })
  .strict();

export const rotateApiKeyBodySchema = z.preprocess(
  (value) => value ?? {},
  z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      expiresAt: apiKeyExpirySchema.optional(),
    })
    .strict(),
);

export const emptyBodySchema = z.preprocess((value) => value ?? {}, z.object({}).strict());

export type UpdateOrganizationBody = z.infer<typeof updateOrganizationBodySchema>;
export type UpdateMembershipBody = z.infer<typeof updateMembershipBodySchema>;
export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>;
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;
export type AcceptInvitationWithTokenBody = z.infer<typeof acceptInvitationWithTokenBodySchema>;
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
export type RotateApiKeyBody = z.infer<typeof rotateApiKeyBodySchema>;
export type MembershipParams = z.infer<typeof membershipParamsSchema>;
export type InvitationParams = z.infer<typeof invitationParamsSchema>;
export type ApiKeyParams = z.infer<typeof apiKeyParamsSchema>;
