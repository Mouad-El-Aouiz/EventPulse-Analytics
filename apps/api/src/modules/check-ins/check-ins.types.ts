import type {
  CheckInReason,
  CheckInSource,
  CheckInStatus,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';

export type CheckInSortField = 'checkedInAt' | 'createdAt';

export interface CheckInSort {
  field: CheckInSortField;
  direction: 'asc' | 'desc';
}

export interface CheckInListFilters {
  eventId?: string;
  participantId?: string;
  statuses?: CheckInStatus[];
  reasons?: CheckInReason[];
  sources?: CheckInSource[];
  from?: Date;
  to?: Date;
  managerScope?: { eventId: string; membershipId: string };
}

export interface CheckInListOptions {
  filters: CheckInListFilters;
  sort: CheckInSort;
  limit: number;
  cursor: { value: string; id: string } | null;
}

export const CHECK_IN_INCLUDE = {
  event: { select: { id: true, name: true, managerMembershipId: true } },
  participant: { select: { id: true, firstName: true, lastName: true } },
  registration: { select: { id: true, status: true, eventId: true, participantId: true } },
} satisfies Prisma.CheckInInclude;

export type CheckInRecord = Prisma.CheckInGetPayload<{ include: typeof CHECK_IN_INCLUDE }>;

export interface CheckInView {
  id: string;
  eventId: string | null;
  participantId: string | null;
  registrationId: string | null;
  status: CheckInStatus;
  reason: CheckInReason | null;
  source: CheckInSource;
  checkedInAt: Date;
  createdAt: Date;
  event: { id: string; name: string } | null;
  participant: { id: string; firstName: string; lastName: string } | null;
  registration: {
    id: string;
    status: RegistrationStatus;
    eventId: string;
    participantId: string;
  } | null;
}

export function toCheckInView(checkIn: CheckInRecord): CheckInView {
  return {
    id: checkIn.id,
    eventId: checkIn.eventId,
    participantId: checkIn.participantId,
    registrationId: checkIn.registrationId,
    status: checkIn.status,
    reason: checkIn.reason,
    source: checkIn.source,
    checkedInAt: checkIn.checkedInAt,
    createdAt: checkIn.createdAt,
    event: checkIn.event === null ? null : { id: checkIn.event.id, name: checkIn.event.name },
    participant: checkIn.participant,
    registration: checkIn.registration,
  };
}
