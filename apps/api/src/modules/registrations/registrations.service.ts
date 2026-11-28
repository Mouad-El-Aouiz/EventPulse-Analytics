import type { RegistrationStatus } from '@prisma/client';
import type { Logger } from 'pino';
import { recordAuditBestEffort } from '../../shared/audit/best-effort-audit.js';
import { forbiddenError } from '../../shared/http/authorization.js';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import type { RequestMetadata } from '../../shared/http/request-context.js';
import type { AuditPort } from '../../shared/ports/audit.port.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import { eventNotFoundError, ticketNotFoundError } from '../events/events.errors.js';
import type { Page } from '../events/events.service.js';
import { participantNotFoundError } from '../participants/participants.errors.js';
import {
  registrationDeleteBlockedError,
  registrationEventRequiredError,
  registrationInvalidTransitionError,
  registrationNotFoundError,
  registrationTicketMismatchError,
} from './registrations.errors.js';
import type { RegistrationsRepository } from './registrations.repository.js';
import type {
  CreateRegistrationBody,
  RegistrationListQuery,
  UpdateRegistrationBody,
} from './registrations.schemas.js';
import {
  toRegistrationView,
  type RegistrationRecord,
  type RegistrationSort,
  type RegistrationView,
} from './registrations.types.js';

const ALLOWED_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'WAITLISTED'],
  WAITLISTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
};

export interface RegistrationsServiceOptions {
  repository: RegistrationsRepository;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
}

function parseSort(value: string): RegistrationSort {
  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = (direction === 'desc' ? value.slice(1) : value) as RegistrationSort['field'];

  return { field, direction };
}

export class RegistrationsService {
  constructor(private readonly options: RegistrationsServiceOptions) {}

  async list(actor: ActorContext, query: RegistrationListQuery): Promise<Page<RegistrationView>> {
    const eventId = query.eventId;
    let managerScope: { eventId: string; membershipId: string } | undefined;

    if (actor.role === 'EVENT_MANAGER') {
      if (eventId === undefined) {
        throw registrationEventRequiredError();
      }

      await this.assertManagedEvent(actor, eventId);
      managerScope = { eventId, membershipId: actor.membershipId };
    }

    const sort = parseSort(query.sort);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);

    if (cursor !== null && Number.isNaN(new Date(cursor.value).getTime())) {
      throw cursorInvalidError();
    }

    const rows = await this.options.repository.list(actor.organizationId, {
      filters: {
        eventId,
        participantId: query.participantId,
        ticketId: query.ticketId,
        statuses: query.status,
        sources: query.source,
        from: query.from,
        to: query.to,
        managerScope,
      },
      sort,
      limit: query.limit,
      cursor,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toRegistrationView),
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(this.sortValue(last, sort), last.id) : null,
    };
  }

  async create(actor: ActorContext, body: CreateRegistrationBody): Promise<RegistrationView> {
    const event = await this.options.repository.findEvent(actor.organizationId, body.eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    this.assertEventManagerScope(actor, event.managerMembershipId);

    const participant = await this.options.repository.findParticipant(
      actor.organizationId,
      body.participantId,
    );

    if (participant === null) {
      throw participantNotFoundError();
    }

    const ticket = await this.options.repository.findTicket(actor.organizationId, body.ticketId);

    if (ticket === null) {
      throw ticketNotFoundError();
    }

    if (ticket.eventId !== body.eventId) {
      throw registrationTicketMismatchError();
    }

    const registration = await this.options.repository.create({
      organizationId: actor.organizationId,
      eventId: body.eventId,
      participantId: body.participantId,
      ticketId: body.ticketId,
      source: body.source,
      sourceDetail: body.sourceDetail ?? null,
    });

    return toRegistrationView(registration);
  }

  async get(actor: ActorContext, registrationId: string): Promise<RegistrationView> {
    return toRegistrationView(await this.getScopedRegistration(actor, registrationId));
  }

  async update(
    actor: ActorContext,
    registrationId: string,
    body: UpdateRegistrationBody,
    metadata: RequestMetadata,
  ): Promise<RegistrationView> {
    const registration = await this.getScopedRegistration(actor, registrationId);

    let ticketId: string | undefined;

    if (body.ticketId !== undefined) {
      const ticket = await this.options.repository.findTicket(actor.organizationId, body.ticketId);

      if (ticket === null) {
        throw ticketNotFoundError();
      }

      if (ticket.eventId !== registration.eventId) {
        throw registrationTicketMismatchError();
      }

      ticketId = ticket.id;
    }

    const updated =
      body.status === undefined
        ? await this.options.repository.update(actor.organizationId, registrationId, {
            ticketId,
          })
        : await this.applyStatusChange(actor, registration, body.status, metadata, ticketId);

    return toRegistrationView(updated);
  }

  async confirm(actor: ActorContext, registrationId: string): Promise<RegistrationView> {
    const registration = await this.getScopedRegistration(actor, registrationId);

    if (registration.status !== 'PENDING' && registration.status !== 'WAITLISTED') {
      throw registrationInvalidTransitionError();
    }

    const updated = await this.options.repository.update(actor.organizationId, registrationId, {
      status: 'CONFIRMED',
    });

    return toRegistrationView(updated);
  }

  async cancel(
    actor: ActorContext,
    registrationId: string,
    metadata: RequestMetadata,
  ): Promise<RegistrationView> {
    const registration = await this.getScopedRegistration(actor, registrationId);

    if (registration.status === 'CANCELLED') {
      throw registrationInvalidTransitionError();
    }

    const updated = await this.applyStatusChange(actor, registration, 'CANCELLED', metadata);

    return toRegistrationView(updated);
  }

  async remove(
    actor: ActorContext,
    registrationId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const registration = await this.getScopedRegistration(actor, registrationId);
    const [transactions, checkIns] = await Promise.all([
      this.options.repository.countTransactions(actor.organizationId, registrationId),
      this.options.repository.countCheckIns(actor.organizationId, registrationId),
    ]);

    if (transactions > 0 || checkIns > 0) {
      throw registrationDeleteBlockedError();
    }

    await this.options.repository.update(actor.organizationId, registrationId, {
      deletedAt: this.options.clock.now(),
    });

    await this.audit(actor, metadata, 'REGISTRATION_DELETED', registration.id);
  }

  private async applyStatusChange(
    actor: ActorContext,
    registration: RegistrationRecord,
    nextStatus: RegistrationStatus,
    metadata: RequestMetadata,
    ticketId?: string,
  ): Promise<RegistrationRecord> {
    if (!ALLOWED_TRANSITIONS[registration.status].includes(nextStatus)) {
      throw registrationInvalidTransitionError();
    }

    const validCheckIn =
      nextStatus === 'CANCELLED'
        ? await this.options.repository.hasValidCheckIn(actor.organizationId, registration.id)
        : false;

    if (validCheckIn && actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
      throw forbiddenError();
    }

    const updated = await this.options.repository.update(actor.organizationId, registration.id, {
      status: nextStatus,
      ticketId,
      ...(nextStatus === 'CANCELLED' ? { cancelledAt: this.options.clock.now() } : {}),
    });

    if (validCheckIn) {
      await this.audit(actor, metadata, 'REGISTRATION_CANCELLED_AFTER_CHECK_IN', registration.id, {
        previousStatus: registration.status,
      });
    }

    return updated;
  }

  private async getScopedRegistration(
    actor: ActorContext,
    registrationId: string,
  ): Promise<RegistrationRecord> {
    const registration = await this.options.repository.findById(
      actor.organizationId,
      registrationId,
    );

    if (registration === null) {
      throw registrationNotFoundError();
    }

    this.assertEventManagerScope(actor, registration.event.managerMembershipId ?? null);

    return registration;
  }

  private async assertManagedEvent(actor: ActorContext, eventId: string): Promise<void> {
    const event = await this.options.repository.findEvent(actor.organizationId, eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    this.assertEventManagerScope(actor, event.managerMembershipId);
  }

  private assertEventManagerScope(actor: ActorContext, managerMembershipId: string | null): void {
    if (actor.role === 'EVENT_MANAGER' && managerMembershipId !== actor.membershipId) {
      throw forbiddenError();
    }
  }

  private sortValue(registration: RegistrationRecord, sort: RegistrationSort): string | Date {
    switch (sort.field) {
      case 'createdAt':
        return registration.createdAt;
      case 'registeredAt':
        return registration.registeredAt;
    }
  }

  private async audit(
    actor: ActorContext,
    metadata: RequestMetadata,
    actionType: string,
    registrationId: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await recordAuditBestEffort(this.options.audit, this.options.logger, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'SENSITIVE_DATA',
      actionType,
      resourceType: 'registration',
      resourceId: registrationId,
      result: 'SUCCESS',
      metadata: extra,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
