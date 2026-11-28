import type { Participant } from '@prisma/client';
import type { Logger } from 'pino';
import { recordAuditBestEffort } from '../../shared/audit/best-effort-audit.js';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import { forbiddenError } from '../../shared/http/authorization.js';
import type { RequestMetadata } from '../../shared/http/request-context.js';
import type { PrismaUnitOfWork } from '../../shared/database/database-client.js';
import type { AuditPort } from '../../shared/ports/audit.port.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import type { Page } from '../events/events.service.js';
import { eventNotFoundError } from '../events/events.errors.js';
import {
  participantErasureBlockedError,
  participantEventRequiredError,
  participantMergeBlockedError,
  participantMergeInvalidError,
  participantNotFoundError,
} from './participants.errors.js';
import type { ParticipantsRepository } from './participants.repository.js';
import type {
  CreateParticipantBody,
  MergeParticipantsBody,
  ParticipantListQuery,
  ParticipantRegistrationsQuery,
  UpdateParticipantBody,
} from './participants.schemas.js';
import {
  toParticipantView,
  type ParticipantRegistrationView,
  type ParticipantSort,
  type ParticipantView,
} from './participants.types.js';

const ANONYMOUS_NAME = 'Anonyme';
const ANONYMIZED_EMAIL_DOMAIN = 'invalid.local';

export interface ParticipantsServiceOptions {
  repository: ParticipantsRepository;
  unitOfWork: PrismaUnitOfWork;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
}

function parseSort(value: string): ParticipantSort {
  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = (direction === 'desc' ? value.slice(1) : value) as ParticipantSort['field'];

  return { field, direction };
}

export class ParticipantsService {
  constructor(private readonly options: ParticipantsServiceOptions) {}

  async list(actor: ActorContext, query: ParticipantListQuery): Promise<Page<ParticipantView>> {
    if (actor.role === 'EVENT_MANAGER') {
      if (query.eventId === undefined) {
        throw participantEventRequiredError();
      }

      await this.assertManagedEvent(actor, query.eventId);
    }

    const sort = parseSort(query.sort);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);

    if (
      cursor !== null &&
      sort.field === 'createdAt' &&
      Number.isNaN(new Date(cursor.value).getTime())
    ) {
      throw cursorInvalidError();
    }

    const rows = await this.options.repository.list(actor.organizationId, {
      filters: {
        eventId: query.eventId,
        q: query.q,
        country: query.country,
        region: query.region,
        city: query.city,
        from: query.from,
        to: query.to,
        managerMembershipId: actor.role === 'EVENT_MANAGER' ? actor.membershipId : undefined,
      },
      sort,
      limit: query.limit,
      cursor,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toParticipantView),
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(this.sortValue(last, sort), last.id) : null,
    };
  }

  async create(actor: ActorContext, body: CreateParticipantBody): Promise<ParticipantView> {
    const participant = await this.options.repository.create({
      organizationId: actor.organizationId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone ?? null,
      country: body.country ?? null,
      region: body.region ?? null,
      city: body.city ?? null,
      birthYear: body.birthYear ?? null,
      gender: body.gender ?? null,
    });

    return toParticipantView(participant);
  }

  async get(actor: ActorContext, participantId: string): Promise<ParticipantView> {
    const participant = await this.getScopedParticipant(actor, participantId);
    return toParticipantView(participant);
  }

  async update(
    actor: ActorContext,
    participantId: string,
    body: UpdateParticipantBody,
  ): Promise<ParticipantView> {
    await this.getScopedParticipant(actor, participantId);

    const participant = await this.options.repository.update(
      actor.organizationId,
      participantId,
      body,
    );

    return toParticipantView(participant);
  }

  async remove(
    actor: ActorContext,
    participantId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.getScopedParticipant(actor, participantId);

    await this.options.repository.update(actor.organizationId, participantId, {
      deletedAt: this.options.clock.now(),
    });

    await this.audit(actor, metadata, 'PARTICIPANT_DELETED', participantId);
  }

  async merge(
    actor: ActorContext,
    body: MergeParticipantsBody,
    metadata: RequestMetadata,
  ): Promise<ParticipantView> {
    const target = await this.options.unitOfWork.run(async (tx) => {
      if (body.sourceParticipantId === body.targetParticipantId) {
        throw participantMergeInvalidError('source and target must differ');
      }

      const source = await this.options.repository.findById(
        actor.organizationId,
        body.sourceParticipantId,
        tx,
      );
      const targetParticipant = await this.options.repository.findById(
        actor.organizationId,
        body.targetParticipantId,
        tx,
      );

      if (source === null || targetParticipant === null) {
        throw participantNotFoundError();
      }

      this.assertMergeable(source);
      this.assertMergeable(targetParticipant);

      const checkIns = await this.options.repository.countCheckIns(
        actor.organizationId,
        source.id,
        tx,
      );

      if (checkIns > 0) {
        throw participantMergeBlockedError();
      }

      await this.options.repository.moveRegistrations(
        actor.organizationId,
        source.id,
        targetParticipant.id,
        tx,
      );
      await this.options.repository.update(
        actor.organizationId,
        source.id,
        {
          mergedIntoParticipantId: targetParticipant.id,
          deletedAt: this.options.clock.now(),
        },
        tx,
      );

      return targetParticipant;
    });

    await this.audit(actor, metadata, 'PARTICIPANT_MERGED', target.id, {
      sourceParticipantId: body.sourceParticipantId,
      targetParticipantId: body.targetParticipantId,
    });

    return toParticipantView(target);
  }

  async anonymize(
    actor: ActorContext,
    participantId: string,
    metadata: RequestMetadata,
  ): Promise<ParticipantView> {
    const participant = await this.getScopedParticipant(actor, participantId);

    if (participant.anonymizedAt !== null) {
      return toParticipantView(participant);
    }

    const updated = await this.options.repository.update(actor.organizationId, participantId, {
      ...this.anonymizedFields(participantId),
      anonymizedAt: this.options.clock.now(),
    });

    await this.audit(actor, metadata, 'PARTICIPANT_ANONYMIZED', participantId);

    return toParticipantView(updated);
  }

  async erase(
    actor: ActorContext,
    participantId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const result = await this.options.unitOfWork.run(async (tx) => {
      const participant = await this.options.repository.findById(
        actor.organizationId,
        participantId,
        tx,
      );

      if (participant === null) {
        throw participantNotFoundError();
      }

      const financialReferences = await this.options.repository.countFinancialReferences(
        actor.organizationId,
        participantId,
        tx,
      );

      if (financialReferences > 0) {
        throw participantErasureBlockedError();
      }

      const references = await Promise.all([
        this.options.repository.countRegistrations(actor.organizationId, participantId, tx),
        this.options.repository.countCheckIns(actor.organizationId, participantId, tx),
        this.options.repository.countMergedParticipants(actor.organizationId, participantId, tx),
      ]);

      if (references.some((count) => count > 0)) {
        await this.options.repository.update(
          actor.organizationId,
          participantId,
          {
            ...this.anonymizedFields(participantId),
            anonymizedAt: participant.anonymizedAt ?? this.options.clock.now(),
            erasedAt: this.options.clock.now(),
          },
          tx,
        );
        return 'purged' as const;
      }

      await this.options.repository.delete(participantId, tx);
      return 'deleted' as const;
    });

    await this.audit(actor, metadata, 'PARTICIPANT_ERASED', participantId, { result });
  }

  async listRegistrations(
    actor: ActorContext,
    participantId: string,
    query: ParticipantRegistrationsQuery,
  ): Promise<Page<ParticipantRegistrationView>> {
    await this.getScopedParticipant(actor, participantId);

    if (actor.role === 'EVENT_MANAGER') {
      if (query.eventId === undefined) {
        throw participantEventRequiredError();
      }

      await this.assertManagedEvent(actor, query.eventId);
    }

    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const registeredAt = cursor === null ? null : new Date(cursor.value);

    if (registeredAt !== null && Number.isNaN(registeredAt.getTime())) {
      throw cursorInvalidError();
    }

    const rows = await this.options.repository.listRegistrations(
      actor.organizationId,
      participantId,
      query.eventId ?? null,
      query.limit,
      registeredAt,
      cursor?.id ?? null,
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((registration) => ({
        id: registration.id,
        eventId: registration.eventId,
        eventName: registration.event.name,
        ticketId: registration.ticketId,
        ticketName: registration.ticket.name,
        status: registration.status,
        registeredAt: registration.registeredAt,
        createdAt: registration.createdAt,
      })),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.registeredAt, last.id) : null,
    };
  }

  private async getScopedParticipant(
    actor: ActorContext,
    participantId: string,
  ): Promise<Participant> {
    const participant = await this.options.repository.findById(actor.organizationId, participantId);

    if (participant === null) {
      throw participantNotFoundError();
    }

    if (actor.role === 'EVENT_MANAGER') {
      const registrations = await this.options.repository.countManagedRegistrations(
        actor.organizationId,
        participantId,
        actor.membershipId,
      );

      if (registrations === 0) {
        throw forbiddenError();
      }
    }

    return participant;
  }

  private async assertManagedEvent(actor: ActorContext, eventId: string): Promise<void> {
    const event = await this.options.repository.findEventScope(actor.organizationId, eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    if (event.managerMembershipId !== actor.membershipId) {
      throw forbiddenError();
    }
  }

  private assertMergeable(participant: Participant): void {
    if (
      participant.deletedAt !== null ||
      participant.anonymizedAt !== null ||
      participant.erasedAt !== null ||
      participant.mergedIntoParticipantId !== null
    ) {
      throw participantMergeInvalidError('participant is not active');
    }
  }

  private anonymizedFields(participantId: string): {
    firstName: string;
    lastName: string;
    email: string;
    phone: null;
    country: null;
    region: null;
    city: null;
    birthYear: null;
    gender: null;
  } {
    return {
      firstName: ANONYMOUS_NAME,
      lastName: ANONYMOUS_NAME,
      email: `anonymized-${participantId}@${ANONYMIZED_EMAIL_DOMAIN}`,
      phone: null,
      country: null,
      region: null,
      city: null,
      birthYear: null,
      gender: null,
    };
  }

  private sortValue(participant: Participant, sort: ParticipantSort): string | Date {
    switch (sort.field) {
      case 'lastName':
        return participant.lastName;
      case 'email':
        return participant.email;
      case 'createdAt':
        return participant.createdAt;
    }
  }

  private async audit(
    actor: ActorContext,
    metadata: RequestMetadata,
    actionType: string,
    participantId: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await recordAuditBestEffort(this.options.audit, this.options.logger, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'SENSITIVE_DATA',
      actionType,
      resourceType: 'participant',
      resourceId: participantId,
      result: 'SUCCESS',
      metadata: extra,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
