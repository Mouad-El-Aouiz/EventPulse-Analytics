import type { EventStatus, Role } from '@prisma/client';
import { forbiddenError } from '../http/authorization.js';
import type { ActorContext } from '../types/actor-context.js';

const READER_VISIBLE_STATUSES = new Set<EventStatus>([
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'ARCHIVED',
]);

export function assertEventManagerScope(
  actor: ActorContext,
  managerMembershipId: string | null,
): void {
  if (actor.role === 'EVENT_MANAGER' && managerMembershipId !== actor.membershipId) {
    throw forbiddenError();
  }
}

export function isEventVisibleToReader(role: Role, status: EventStatus): boolean {
  if (role === 'ANALYST' || role === 'VIEWER') {
    return READER_VISIBLE_STATUSES.has(status);
  }

  return true;
}
