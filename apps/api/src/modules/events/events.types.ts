import type { Event, EventStatus, EventType, Ticket } from '@prisma/client';

export type EventSortField = 'startAt' | 'name' | 'createdAt';

export interface EventSort {
  field: EventSortField;
  direction: 'asc' | 'desc';
}

export interface EventListFilters {
  statuses?: EventStatus[];
  eventType?: EventType;
  from?: Date;
  to?: Date;
  q?: string;
  managerMembershipId?: string;
  managerScope?: string;
}

export interface EventListOptions {
  filters: EventListFilters;
  sort: EventSort;
  limit: number;
  cursor: { value: string; id: string } | null;
}

export interface EventView {
  id: string;
  name: string;
  type: EventType;
  status: EventStatus;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location: string | null;
  description: string | null;
  checkInOpensOffsetMinutes: number;
  checkInClosesOffsetMinutes: number;
  managerMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketView {
  id: string;
  eventId: string;
  name: string;
  priceAmount: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toEventView(event: Event): EventView {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    status: event.status,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    location: event.location,
    description: event.description,
    checkInOpensOffsetMinutes: event.checkInOpensOffsetMinutes,
    checkInClosesOffsetMinutes: event.checkInClosesOffsetMinutes,
    managerMembershipId: event.managerMembershipId,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function toTicketView(ticket: Ticket): TicketView {
  return {
    id: ticket.id,
    eventId: ticket.eventId,
    name: ticket.name,
    priceAmount: ticket.priceAmount.toFixed(2),
    currency: ticket.currency,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}
