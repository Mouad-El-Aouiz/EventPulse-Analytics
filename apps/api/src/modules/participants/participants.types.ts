import type { Gender, Participant, RegistrationStatus } from '@prisma/client';

export type ParticipantSortField = 'lastName' | 'createdAt' | 'email';

export interface ParticipantSort {
  field: ParticipantSortField;
  direction: 'asc' | 'desc';
}

export interface ParticipantListFilters {
  eventId?: string;
  q?: string;
  country?: string;
  region?: string;
  city?: string;
  from?: Date;
  to?: Date;
  managerMembershipId?: string;
}

export interface ParticipantListOptions {
  filters: ParticipantListFilters;
  sort: ParticipantSort;
  limit: number;
  cursor: { value: string; id: string } | null;
}

export interface ParticipantView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  birthYear: number | null;
  gender: Gender | null;
  anonymizedAt: Date | null;
  erasedAt: Date | null;
  mergedIntoParticipantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantRegistrationView {
  id: string;
  eventId: string;
  eventName: string;
  ticketId: string;
  ticketName: string;
  status: RegistrationStatus;
  registeredAt: Date;
  createdAt: Date;
}

export function toParticipantView(participant: Participant): ParticipantView {
  return {
    id: participant.id,
    firstName: participant.firstName,
    lastName: participant.lastName,
    email: participant.email,
    phone: participant.phone,
    country: participant.country,
    region: participant.region,
    city: participant.city,
    birthYear: participant.birthYear,
    gender: participant.gender,
    anonymizedAt: participant.anonymizedAt,
    erasedAt: participant.erasedAt,
    mergedIntoParticipantId: participant.mergedIntoParticipantId,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
  };
}
