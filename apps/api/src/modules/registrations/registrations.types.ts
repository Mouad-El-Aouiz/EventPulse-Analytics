import type { Prisma, RegistrationSource, RegistrationStatus } from '@prisma/client';
import { formatMoney } from '../../shared/finance/money.js';

export type RegistrationSortField = 'registeredAt' | 'createdAt';

export interface RegistrationSort {
  field: RegistrationSortField;
  direction: 'asc' | 'desc';
}

export interface RegistrationListFilters {
  eventId?: string;
  participantId?: string;
  ticketId?: string;
  statuses?: RegistrationStatus[];
  sources?: RegistrationSource[];
  from?: Date;
  to?: Date;
  managerScope?: { eventId: string; membershipId: string };
}

export interface RegistrationListOptions {
  filters: RegistrationListFilters;
  sort: RegistrationSort;
  limit: number;
  cursor: { value: string; id: string } | null;
}

export const REGISTRATION_INCLUDE = {
  event: { select: { id: true, name: true, managerMembershipId: true } },
  participant: { select: { id: true, firstName: true, lastName: true, email: true } },
  ticket: { select: { id: true, name: true, priceAmount: true } },
} satisfies Prisma.RegistrationInclude;

export type RegistrationRecord = Prisma.RegistrationGetPayload<{
  include: typeof REGISTRATION_INCLUDE;
}>;

export interface RegistrationView {
  id: string;
  eventId: string;
  participantId: string;
  ticketId: string;
  status: RegistrationStatus;
  source: RegistrationSource;
  sourceDetail: string | null;
  registeredAt: Date;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  event: { id: string; name: string };
  participant: { id: string; firstName: string; lastName: string; email: string };
  ticket: { id: string; name: string; priceAmount: string };
}

export function toRegistrationView(registration: RegistrationRecord): RegistrationView {
  return {
    id: registration.id,
    eventId: registration.eventId,
    participantId: registration.participantId,
    ticketId: registration.ticketId,
    status: registration.status,
    source: registration.source,
    sourceDetail: registration.sourceDetail,
    registeredAt: registration.registeredAt,
    cancelledAt: registration.cancelledAt,
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
    event: { id: registration.event.id, name: registration.event.name },
    participant: registration.participant,
    ticket: {
      ...registration.ticket,
      priceAmount: formatMoney(registration.ticket.priceAmount),
    },
  };
}
