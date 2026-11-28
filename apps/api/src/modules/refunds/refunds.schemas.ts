import { z } from 'zod';

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const refundParamsSchema = z
  .object({
    refundId: z.string().uuid(),
  })
  .strict();

const refundSortSchema = z
  .enum(['refundedAt', '-refundedAt', 'createdAt', '-createdAt', 'amount', '-amount'])
  .default('-refundedAt');

export const refundListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    eventId: z.string().uuid().optional(),
    transactionId: z.string().uuid().optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    sort: refundSortSchema,
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

export type RefundListQuery = z.infer<typeof refundListQuerySchema>;
export type RefundParams = z.infer<typeof refundParamsSchema>;
