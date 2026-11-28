import { z } from 'zod';
import { MONEY_PATTERN } from '../../shared/finance/money.js';

export const EVENT_TYPES = ['EXHIBITION', 'CONFERENCE', 'WORKSHOP', 'TRADE_SHOW', 'OTHER'] as const;

export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED',
] as const;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

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

const offsetSchema = z.number().int().min(-525_600).max(525_600);

const locationSchema = z.string().trim().max(255).nullable().optional();
const descriptionSchema = z.string().trim().max(10_000).nullable().optional();

export const eventParamsSchema = z
  .object({
    eventId: z.string().uuid(),
  })
  .strict();

export const ticketParamsSchema = z
  .object({
    eventId: z.string().uuid(),
    ticketId: z.string().uuid(),
  })
  .strict();

export const createEventBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: z.enum(EVENT_TYPES),
    startAt: dateSchema,
    endAt: dateSchema,
    timezone: timezoneSchema,
    location: locationSchema,
    description: descriptionSchema,
    checkInOpensOffsetMinutes: offsetSchema.default(-120),
    checkInClosesOffsetMinutes: offsetSchema.default(120),
    managerMembershipId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endAt <= value.startAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: '"endAt" must be greater than "startAt".',
      });
    }

    if (value.checkInOpensOffsetMinutes > value.checkInClosesOffsetMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkInClosesOffsetMinutes'],
        message: 'The check-in window must be ordered.',
      });
    }
  });

export const updateEventBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    type: z.enum(EVENT_TYPES).optional(),
    startAt: dateSchema.optional(),
    endAt: dateSchema.optional(),
    timezone: timezoneSchema.optional(),
    location: locationSchema,
    description: descriptionSchema,
    checkInOpensOffsetMinutes: offsetSchema.optional(),
    checkInClosesOffsetMinutes: offsetSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const assignManagerBodySchema = z
  .object({
    membershipId: z.string().uuid().nullable(),
  })
  .strict();

const statusListSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
  z.array(z.enum(EVENT_STATUSES)).min(1),
);

const eventSortSchema = z
  .enum(['startAt', '-startAt', 'name', '-name', 'createdAt', '-createdAt'])
  .default('-startAt');

export const eventListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    status: statusListSchema.optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    q: z.string().trim().min(2).max(100).optional(),
    managerMembershipId: z.string().uuid().optional(),
    sort: eventSortSchema,
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

const moneySchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, { message: 'Must be a decimal amount with at most two decimals.' });

export const createTicketBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    priceAmount: moneySchema,
    currency: z.literal('EUR').optional(),
  })
  .strict();

export const updateTicketBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    priceAmount: moneySchema.optional(),
    currency: z.literal('EUR').optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const ticketListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type CreateEventBody = z.infer<typeof createEventBodySchema>;
export type UpdateEventBody = z.infer<typeof updateEventBodySchema>;
export type AssignManagerBody = z.infer<typeof assignManagerBodySchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type EventParams = z.infer<typeof eventParamsSchema>;
export type TicketParams = z.infer<typeof ticketParamsSchema>;
export type CreateTicketBody = z.infer<typeof createTicketBodySchema>;
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>;
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
