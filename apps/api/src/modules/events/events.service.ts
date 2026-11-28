import type { Event, EventStatus } from '@prisma/client';
import type { Logger } from 'pino';
import { recordAuditBestEffort } from '../../shared/audit/best-effort-audit.js';
import {
  assertEventManagerScope,
  isEventVisibleToReader,
} from '../../shared/access/event-scope.js';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../shared/http/cursor.js';
import { forbiddenError } from '../../shared/http/authorization.js';
import type { RequestMetadata } from '../../shared/http/request-context.js';
import type { AuditPort } from '../../shared/ports/audit.port.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { ActorContext } from '../../shared/types/actor-context.js';
import {
  eventDatesInvalidError,
  eventDeleteNotAllowedError,
  eventFieldsFrozenError,
  eventHasRegistrationsError,
  eventInvalidTransitionError,
  eventManagerInvalidError,
  eventNotFoundError,
  eventTypeFrozenError,
} from './events.errors.js';
import type { EventsRepository } from './events.repository.js';
import type {
  AssignManagerBody,
  CreateEventBody,
  EventListQuery,
  UpdateEventBody,
} from './events.schemas.js';
import { toEventView, type EventSort, type EventView } from './events.types.js';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface TransitionRule {
  from: EventStatus[];
  actionType: string;
}

const TRANSITIONS: Record<'publish' | 'start' | 'complete' | 'archive' | 'cancel', TransitionRule> =
  {
    publish: { from: ['DRAFT'], actionType: 'EVENT_PUBLISHED' },
    start: { from: ['PUBLISHED'], actionType: 'EVENT_STARTED' },
    complete: { from: ['ONGOING'], actionType: 'EVENT_COMPLETED' },
    archive: { from: ['COMPLETED'], actionType: 'EVENT_ARCHIVED' },
    cancel: { from: ['DRAFT', 'PUBLISHED', 'ONGOING'], actionType: 'EVENT_CANCELLED' },
  };

const VISIBLE_READER_STATUSES: EventStatus[] = ['PUBLISHED', 'ONGOING', 'COMPLETED', 'ARCHIVED'];

const SCHEDULING_FIELDS = [
  'startAt',
  'endAt',
  'timezone',
  'checkInOpensOffsetMinutes',
  'checkInClosesOffsetMinutes',
] as const;

export interface EventsServiceOptions {
  repository: EventsRepository;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
}

function parseSort(value: string): EventSort {
  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = (direction === 'desc' ? value.slice(1) : value) as EventSort['field'];

  return { field, direction };
}

function parseCursorDate(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw cursorInvalidError();
  }

  return date;
}

export class EventsService {
  constructor(private readonly options: EventsServiceOptions) {}

  async list(actor: ActorContext, query: EventListQuery): Promise<Page<EventView>> {
    if (query.managerMembershipId !== undefined && actor.role === 'EVENT_MANAGER') {
      throw forbiddenError();
    }

    const sort = parseSort(query.sort);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);

    if (cursor !== null && sort.field !== 'name') {
      parseCursorDate(cursor.value);
    }

    let statuses = query.status;

    if (actor.role === 'ANALYST' || actor.role === 'VIEWER') {
      statuses =
        statuses === undefined
          ? VISIBLE_READER_STATUSES
          : statuses.filter((status) => isEventVisibleToReader(actor.role, status));
    }

    const rows = await this.options.repository.list(actor.organizationId, {
      filters: {
        statuses,
        eventType: query.eventType,
        from: query.from,
        to: query.to,
        q: query.q,
        managerMembershipId: query.managerMembershipId,
        managerScope: actor.role === 'EVENT_MANAGER' ? actor.membershipId : undefined,
      },
      sort,
      limit: query.limit,
      cursor,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toEventView),
      nextCursor:
        hasMore && last !== undefined ? encodeCursor(this.sortValue(last, sort), last.id) : null,
    };
  }

  async create(
    actor: ActorContext,
    body: CreateEventBody,
    metadata: RequestMetadata,
  ): Promise<EventView> {
    let managerMembershipId = body.managerMembershipId ?? null;

    if (actor.role === 'EVENT_MANAGER') {
      if (managerMembershipId !== null && managerMembershipId !== actor.membershipId) {
        throw forbiddenError();
      }

      managerMembershipId = actor.membershipId;
    } else if (managerMembershipId !== null) {
      await this.assertManager(actor.organizationId, managerMembershipId);
    }

    this.assertScheduling(
      body.startAt,
      body.endAt,
      body.checkInOpensOffsetMinutes,
      body.checkInClosesOffsetMinutes,
    );

    const event = await this.options.repository.create({
      organizationId: actor.organizationId,
      name: body.name,
      type: body.type,
      startAt: body.startAt,
      endAt: body.endAt,
      timezone: body.timezone,
      location: body.location ?? null,
      description: body.description ?? null,
      checkInOpensOffsetMinutes: body.checkInOpensOffsetMinutes,
      checkInClosesOffsetMinutes: body.checkInClosesOffsetMinutes,
      managerMembershipId,
    });

    await this.recordAudit(actor, metadata, {
      actionType: 'EVENT_CREATED',
      resourceType: 'event',
      resourceId: event.id,
      metadata: { status: event.status, type: event.type },
    });

    return toEventView(event);
  }

  async get(actor: ActorContext, eventId: string): Promise<EventView> {
    return toEventView(await this.getReadableEvent(actor, eventId));
  }

  async update(
    actor: ActorContext,
    eventId: string,
    body: UpdateEventBody,
    metadata: RequestMetadata,
  ): Promise<EventView> {
    const event = await this.getWritableEvent(actor, eventId);
    const fields = Object.keys(body);

    if (
      (event.status === 'ONGOING' ||
        event.status === 'COMPLETED' ||
        event.status === 'ARCHIVED' ||
        event.status === 'CANCELLED') &&
      SCHEDULING_FIELDS.some((field) => field in body)
    ) {
      throw eventFieldsFrozenError();
    }

    if (body.type !== undefined && event.status !== 'DRAFT' && event.status !== 'PUBLISHED') {
      throw eventTypeFrozenError();
    }

    const startAt = body.startAt ?? event.startAt;
    const endAt = body.endAt ?? event.endAt;
    const opens = body.checkInOpensOffsetMinutes ?? event.checkInOpensOffsetMinutes;
    const closes = body.checkInClosesOffsetMinutes ?? event.checkInClosesOffsetMinutes;

    this.assertScheduling(startAt, endAt, opens, closes);

    const updated = await this.options.repository.update(actor.organizationId, eventId, {
      name: body.name,
      type: body.type,
      startAt: body.startAt,
      endAt: body.endAt,
      timezone: body.timezone,
      location: body.location,
      description: body.description,
      checkInOpensOffsetMinutes: body.checkInOpensOffsetMinutes,
      checkInClosesOffsetMinutes: body.checkInClosesOffsetMinutes,
    });

    await this.recordAudit(actor, metadata, {
      actionType: 'EVENT_UPDATED',
      resourceType: 'event',
      resourceId: updated.id,
      metadata: { fields },
    });

    return toEventView(updated);
  }

  async remove(actor: ActorContext, eventId: string, metadata: RequestMetadata): Promise<void> {
    const event = await this.getWritableEvent(actor, eventId);

    if (event.status !== 'DRAFT' && event.status !== 'CANCELLED') {
      throw eventDeleteNotAllowedError();
    }

    const registrations = await this.options.repository.countRegistrations(
      actor.organizationId,
      eventId,
    );

    if (registrations > 0) {
      throw eventHasRegistrationsError();
    }

    await this.options.repository.update(actor.organizationId, eventId, {
      deletedAt: this.options.clock.now(),
    });

    await this.recordAudit(actor, metadata, {
      actionType: 'EVENT_DELETED',
      resourceType: 'event',
      resourceId: eventId,
      metadata: { previousStatus: event.status },
    });
  }

  async transition(
    actor: ActorContext,
    eventId: string,
    action: keyof typeof TRANSITIONS,
    metadata: RequestMetadata,
  ): Promise<EventView> {
    const event = await this.getWritableEvent(actor, eventId);
    const rule = TRANSITIONS[action];

    if (!rule.from.includes(event.status)) {
      await this.recordAudit(
        actor,
        metadata,
        {
          actionType: 'EVENT_TRANSITION_REJECTED',
          resourceType: 'event',
          resourceId: eventId,
          result: 'FAILURE',
          metadata: { from: event.status, action },
        },
        false,
      );
      throw eventInvalidTransitionError();
    }

    if (action === 'publish') {
      this.assertPublishable(event);
    }

    const nextStatus = this.transitionTarget(action);
    const updated = await this.options.repository.update(actor.organizationId, eventId, {
      status: nextStatus,
    });

    await this.recordAudit(actor, metadata, {
      actionType: rule.actionType,
      resourceType: 'event',
      resourceId: eventId,
      metadata: { from: event.status, to: nextStatus },
    });

    return toEventView(updated);
  }

  async assignManager(
    actor: ActorContext,
    eventId: string,
    body: AssignManagerBody,
    metadata: RequestMetadata,
  ): Promise<EventView> {
    const event = await this.options.repository.findById(actor.organizationId, eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    if (body.membershipId !== null) {
      await this.assertManager(actor.organizationId, body.membershipId);
    }

    const updated = await this.options.repository.update(actor.organizationId, eventId, {
      managerMembershipId: body.membershipId,
    });

    await this.recordAudit(actor, metadata, {
      actionType: 'EVENT_MANAGER_ASSIGNED',
      resourceType: 'event',
      resourceId: eventId,
      metadata: {
        previousManagerMembershipId: event.managerMembershipId,
        managerMembershipId: body.membershipId,
      },
    });

    return toEventView(updated);
  }

  async getReadableEvent(actor: ActorContext, eventId: string): Promise<Event> {
    const event = await this.options.repository.findById(actor.organizationId, eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    assertEventManagerScope(actor, event.managerMembershipId);

    if (!isEventVisibleToReader(actor.role, event.status)) {
      throw eventNotFoundError();
    }

    return event;
  }

  async getWritableEvent(actor: ActorContext, eventId: string): Promise<Event> {
    if (actor.role === 'ANALYST' || actor.role === 'VIEWER') {
      throw forbiddenError();
    }

    const event = await this.options.repository.findById(actor.organizationId, eventId);

    if (event === null) {
      throw eventNotFoundError();
    }

    assertEventManagerScope(actor, event.managerMembershipId);

    return event;
  }

  private async assertManager(organizationId: string, membershipId: string): Promise<void> {
    const membership = await this.options.repository.findActiveEventManager(
      organizationId,
      membershipId,
    );

    if (membership === null) {
      throw eventManagerInvalidError();
    }
  }

  private assertScheduling(startAt: Date, endAt: Date, opens: number, closes: number): void {
    if (endAt <= startAt || opens > closes) {
      throw eventDatesInvalidError();
    }
  }

  private assertPublishable(event: Event): void {
    if (event.name.trim().length === 0 || event.endAt <= event.startAt) {
      throw eventInvalidTransitionError();
    }
  }

  private transitionTarget(action: keyof typeof TRANSITIONS): EventStatus {
    switch (action) {
      case 'publish':
        return 'PUBLISHED';
      case 'start':
        return 'ONGOING';
      case 'complete':
        return 'COMPLETED';
      case 'archive':
        return 'ARCHIVED';
      case 'cancel':
        return 'CANCELLED';
    }
  }

  private sortValue(event: Event, sort: EventSort): string | Date {
    switch (sort.field) {
      case 'name':
        return event.name;
      case 'createdAt':
        return event.createdAt;
      case 'startAt':
        return event.startAt;
    }
  }

  private async recordAudit(
    actor: ActorContext,
    metadata: RequestMetadata,
    event: {
      actionType: string;
      resourceType: string;
      resourceId: string;
      metadata: Record<string, unknown>;
      result?: 'SUCCESS' | 'FAILURE';
    },
    wait = true,
  ): Promise<void> {
    const task = recordAuditBestEffort(this.options.audit, this.options.logger, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'ORGANIZATION',
      actionType: event.actionType,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      result: event.result ?? 'SUCCESS',
      metadata: event.metadata,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    if (wait) {
      await task;
    }
  }
}
