import type { CheckInReason } from '@prisma/client';
import type { Logger } from 'pino';
import { recordAuditBestEffort } from '../../shared/audit/best-effort-audit.js';
import { forbiddenError } from '../../shared/http/authorization.js';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import type { RequestMetadata } from '../../shared/http/request-context.js';
import type { AuditPort } from '../../shared/ports/audit.port.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import { eventNotFoundError } from '../events/events.errors.js';
import type { Page } from '../events/events.service.js';
import {
  checkInDuplicateError,
  checkInEventRequiredError,
  checkInNotFoundError,
} from './check-ins.errors.js';
import type { CheckInsRepository } from './check-ins.repository.js';
import type { CheckInListQuery, CreateCheckInBody } from './check-ins.schemas.js';
import {
  toCheckInView,
  type CheckInRecord,
  type CheckInSort,
  type CheckInView,
} from './check-ins.types.js';

const WINDOW_MINUTE_MS = 60_000;

interface InvalidCheckInInput {
  reason: CheckInReason;
  eventId: string | null;
  participantId: string | null;
  registrationId: string | null;
  checkedInAt: Date;
  source: CreateCheckInBody['source'];
}

export interface CheckInsServiceOptions {
  repository: CheckInsRepository;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
}

function parseSort(value: string): CheckInSort {
  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = (direction === 'desc' ? value.slice(1) : value) as CheckInSort['field'];

  return { field, direction };
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export class CheckInsService {
  constructor(private readonly options: CheckInsServiceOptions) {}

  async list(actor: ActorContext, query: CheckInListQuery): Promise<Page<CheckInView>> {
    const eventId = query.eventId;
    let managerScope: { eventId: string; membershipId: string } | undefined;

    if (actor.role === 'EVENT_MANAGER') {
      if (eventId === undefined) {
        throw checkInEventRequiredError();
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
        statuses: query.status,
        reasons: query.reason,
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
      items: page.map(toCheckInView),
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(this.sortValue(last, sort), last.id) : null,
    };
  }

  async get(actor: ActorContext, checkInId: string): Promise<CheckInView> {
    const checkIn = await this.options.repository.findById(actor.organizationId, checkInId);

    if (checkIn === null) {
      throw checkInNotFoundError();
    }

    if (actor.role === 'EVENT_MANAGER') {
      if (checkIn.event === null || checkIn.event.managerMembershipId !== actor.membershipId) {
        throw forbiddenError();
      }
    }

    return toCheckInView(checkIn);
  }

  async create(
    actor: ActorContext,
    body: CreateCheckInBody,
    metadata: RequestMetadata,
  ): Promise<CheckInView> {
    const checkedInAt = body.checkedInAt ?? this.options.clock.now();
    const [participant, event] = await Promise.all([
      this.options.repository.findParticipant(actor.organizationId, body.participantId),
      this.options.repository.findEvent(actor.organizationId, body.eventId),
    ]);

    if (event !== null) {
      this.assertEventManagerScope(actor, event.managerMembershipId);
    }

    if (participant === null) {
      return this.recordInvalid(actor, metadata, {
        reason: 'PARTICIPANT_NOT_FOUND',
        eventId: event?.id ?? null,
        participantId: null,
        registrationId: null,
        checkedInAt,
        source: body.source,
      });
    }

    if (event === null) {
      return this.recordInvalid(actor, metadata, {
        reason: 'EVENT_NOT_FOUND',
        eventId: null,
        participantId: participant.id,
        registrationId: null,
        checkedInAt,
        source: body.source,
      });
    }

    const registration = await this.options.repository.findRegistration(
      actor.organizationId,
      body.registrationId,
    );

    if (
      registration === null ||
      registration.eventId !== event.id ||
      registration.participantId !== participant.id
    ) {
      return this.recordInvalid(actor, metadata, {
        reason: 'REGISTRATION_NOT_FOUND',
        eventId: event.id,
        participantId: participant.id,
        registrationId: null,
        checkedInAt,
        source: body.source,
      });
    }

    if (event.status === 'CANCELLED') {
      return this.recordInvalid(actor, metadata, {
        reason: 'EVENT_CANCELLED',
        eventId: event.id,
        participantId: participant.id,
        registrationId: registration.id,
        checkedInAt,
        source: body.source,
      });
    }

    if (registration.status === 'CANCELLED') {
      return this.recordInvalid(actor, metadata, {
        reason: 'REGISTRATION_CANCELLED',
        eventId: event.id,
        participantId: participant.id,
        registrationId: registration.id,
        checkedInAt,
        source: body.source,
      });
    }

    if (registration.status !== 'CONFIRMED') {
      return this.recordInvalid(actor, metadata, {
        reason: 'REGISTRATION_NOT_CONFIRMED',
        eventId: event.id,
        participantId: participant.id,
        registrationId: registration.id,
        checkedInAt,
        source: body.source,
      });
    }

    if (
      !this.withinWindow(
        event.startAt,
        event.endAt,
        event.checkInOpensOffsetMinutes,
        event.checkInClosesOffsetMinutes,
        checkedInAt,
      )
    ) {
      return this.recordInvalid(actor, metadata, {
        reason: 'OUTSIDE_WINDOW',
        eventId: event.id,
        participantId: participant.id,
        registrationId: registration.id,
        checkedInAt,
        source: body.source,
      });
    }

    if (
      await this.options.repository.hasValidCheckIn(actor.organizationId, event.id, participant.id)
    ) {
      await this.audit(actor, metadata, 'CHECK_IN_REJECTED', registration.id, 'FAILURE', {
        reason: 'DUPLICATE',
      });
      throw checkInDuplicateError();
    }

    let checkIn: CheckInRecord;

    try {
      checkIn = await this.options.repository.create({
        organizationId: actor.organizationId,
        eventId: event.id,
        participantId: participant.id,
        registrationId: registration.id,
        status: 'VALID',
        reason: null,
        source: body.source,
        checkedInAt,
        createdByUserId: actor.userId,
      });
    } catch (error) {
      if (isErrorWithCode(error, 'P2002')) {
        await this.audit(actor, metadata, 'CHECK_IN_REJECTED', registration.id, 'FAILURE', {
          reason: 'DUPLICATE',
        });
        throw checkInDuplicateError();
      }

      throw error;
    }

    await this.audit(actor, metadata, 'CHECK_IN_RECORDED', checkIn.id, 'SUCCESS', {
      source: body.source,
    });

    return toCheckInView(checkIn);
  }

  private async recordInvalid(
    actor: ActorContext,
    metadata: RequestMetadata,
    input: InvalidCheckInInput,
  ): Promise<CheckInView> {
    const checkIn = await this.options.repository.create({
      organizationId: actor.organizationId,
      eventId: input.eventId,
      participantId: input.participantId,
      registrationId: input.registrationId,
      status: 'INVALID',
      reason: input.reason,
      source: input.source,
      checkedInAt: input.checkedInAt,
      createdByUserId: actor.userId,
    });

    await this.audit(actor, metadata, 'CHECK_IN_RECORDED', checkIn.id, 'FAILURE', {
      reason: input.reason,
      source: input.source,
    });

    return toCheckInView(checkIn);
  }

  private withinWindow(
    startAt: Date,
    endAt: Date,
    opensOffsetMinutes: number,
    closesOffsetMinutes: number,
    checkedInAt: Date,
  ): boolean {
    const opensAt = startAt.getTime() + opensOffsetMinutes * WINDOW_MINUTE_MS;
    const closesAt = endAt.getTime() + closesOffsetMinutes * WINDOW_MINUTE_MS;
    const instant = checkedInAt.getTime();

    return instant >= opensAt && instant <= closesAt;
  }

  private sortValue(checkIn: CheckInRecord, sort: CheckInSort): string {
    return sort.field === 'createdAt'
      ? checkIn.createdAt.toISOString()
      : checkIn.checkedInAt.toISOString();
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

  private async audit(
    actor: ActorContext,
    metadata: RequestMetadata,
    actionType: string,
    resourceId: string,
    result: 'SUCCESS' | 'FAILURE',
    extra: Record<string, unknown>,
  ): Promise<void> {
    await recordAuditBestEffort(this.options.audit, this.options.logger, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'SENSITIVE_DATA',
      actionType,
      resourceType: 'check_in',
      resourceId,
      result,
      metadata: extra,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }
}
