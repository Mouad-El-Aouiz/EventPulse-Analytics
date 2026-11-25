import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL_MAX_LENGTH = 320;

const emailSchema = z.string().trim().toLowerCase().min(3).max(EMAIL_MAX_LENGTH).email();

export const loginBodySchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    organizationId: z.string().uuid().optional(),
  })
  .strict();

export const forgotPasswordBodySchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(20).max(512),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  })
  .strict();

export const switchOrganizationBodySchema = z
  .object({
    organizationId: z.string().uuid(),
  })
  .strict();

export const sessionParamsSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

export const emptyBodySchema = z.preprocess((value) => value ?? {}, z.object({}).strict());

export type LoginBody = z.infer<typeof loginBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type SwitchOrganizationBody = z.infer<typeof switchOrganizationBodySchema>;
export type SessionParams = z.infer<typeof sessionParamsSchema>;
