import { z } from 'zod';
import { MONEY_PATTERN } from '../../shared/finance/money.js';

export const TRANSACTION_TYPES = ['TICKET', 'BOOTH'] as const;
export const TRANSACTION_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export const MANUAL_TRANSACTION_STATUSES = ['PAID', 'FAILED', 'CANCELLED'] as const;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const moneySchema = z
  .string()
  .regex(MONEY_PATTERN, { message: 'Amount must be a decimal string with at most 2 decimals.' })
  .refine((value) => Number(value) > 0, { message: 'Amount must be greater than zero.' });

export const transactionParamsSchema = z
  .object({
    transactionId: z.string().uuid(),
  })
  .strict();

export const createTransactionBodySchema = z
  .object({
    eventId: z.string().uuid(),
    type: z.enum(TRANSACTION_TYPES),
    amount: moneySchema,
    registrationId: z.string().uuid().optional(),
    boothReservationId: z.string().uuid().optional(),
  })
  .strict();

export const updateTransactionBodySchema = z
  .object({
    status: z.enum(MANUAL_TRANSACTION_STATUSES),
  })
  .strict();

export const createRefundBodySchema = z
  .object({
    amount: moneySchema,
    reason: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

const transactionSortSchema = z
  .enum(['createdAt', '-createdAt', 'paidAt', '-paidAt', 'amount', '-amount'])
  .default('-createdAt');

export const transactionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    eventId: z.string().uuid().optional(),
    type: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(TRANSACTION_TYPES)).min(1),
      )
      .optional(),
    status: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
        z.array(z.enum(TRANSACTION_STATUSES)).min(1),
      )
      .optional(),
    registrationId: z.string().uuid().optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sort: transactionSortSchema,
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

export type CreateTransactionBody = z.infer<typeof createTransactionBodySchema>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionBodySchema>;
export type CreateRefundBody = z.infer<typeof createRefundBodySchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type TransactionParams = z.infer<typeof transactionParamsSchema>;
