import type { Membership, Role } from '@prisma/client';
import type { Logger } from 'pino';
import { sanitizedErrorFields } from '../../../errors/error-logging.js';
import type { AuditEvent, AuditPort } from '../../../shared/ports/audit.port.js';
import type { Clock } from '../../../shared/ports/clock.port.js';
import type { ActorContext } from '../../../shared/types/actor-context.js';
import { forbiddenError } from '../../../shared/http/authorization.js';
import { lastOwnerProtectedError, membershipNotFoundError } from '../organizations.errors.js';
import type {
  MembershipView,
  RequestMetadata,
  UpdateMembershipInput,
} from '../organizations.types.js';
import type { MembershipRepository } from '../repositories/membership.repository.js';
import type { OrganizationRepository } from '../repositories/organization.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../repositories/organizations-unit-of-work.js';
import type { AuthFacade } from '../../auth/auth.facade.js';

export interface MembershipServiceOptions {
  memberships: MembershipRepository;
  organizations: OrganizationRepository;
  unitOfWork: PrismaOrganizationsUnitOfWork;
  auth: AuthFacade;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
}

interface ApplyResult {
  before: Membership;
  after: Membership;
  releasedEvents: number;
}

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  ANALYST: 2,
  EVENT_MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export class MembershipService {
  constructor(private readonly options: MembershipServiceOptions) {}

  async list(actor: ActorContext): Promise<MembershipView[]> {
    const memberships = await this.options.memberships.listWithUsers(actor.organizationId);

    return memberships.map((membership) => ({
      id: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      displayName: membership.user.displayName,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
      disabledAt: membership.disabledAt,
    }));
  }

  async update(
    actor: ActorContext,
    membershipId: string,
    input: UpdateMembershipInput,
    metadata: RequestMetadata,
  ): Promise<MembershipView> {
    const result = await this.applyUpdate(actor, membershipId, input);

    if (result.before.role !== result.after.role) {
      await this.recordAudit({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        category: 'USERS_ROLES',
        actionType: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
        resourceType: 'membership',
        resourceId: membershipId,
        result: 'SUCCESS',
        metadata: {
          previousRole: result.before.role,
          newRole: result.after.role,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    if (result.before.status !== result.after.status) {
      const disabled = result.after.status === 'DISABLED';

      await this.recordAudit({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        category: 'USERS_ROLES',
        actionType: disabled ? 'ORGANIZATION_MEMBER_DISABLED' : 'ORGANIZATION_MEMBER_REACTIVATED',
        resourceType: 'membership',
        resourceId: membershipId,
        result: 'SUCCESS',
        metadata: { previousRole: result.after.role },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    const member = await this.options.memberships.findById(actor.organizationId, membershipId);

    if (member === null) {
      throw membershipNotFoundError();
    }

    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      displayName: member.user.displayName,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      disabledAt: member.disabledAt,
    };
  }

  async remove(
    actor: ActorContext,
    membershipId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const result = await this.applyUpdate(actor, membershipId, { status: 'DISABLED' });

    if (result.before.status !== 'DISABLED') {
      await this.recordAudit({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        category: 'USERS_ROLES',
        actionType: 'ORGANIZATION_MEMBER_DISABLED',
        resourceType: 'membership',
        resourceId: membershipId,
        result: 'SUCCESS',
        metadata: { previousRole: result.after.role, via: 'delete' },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }
  }

  private async applyUpdate(
    actor: ActorContext,
    membershipId: string,
    input: UpdateMembershipInput,
  ): Promise<ApplyResult> {
    return this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);

      // Re-read the caller's membership inside the transaction so a role
      // downgrade committed after the request was authenticated cannot be
      // bypassed by a stale actor snapshot.
      const actorMembership = await this.options.memberships.findById(
        actor.organizationId,
        actor.membershipId,
        tx,
      );

      if (actorMembership === null || actorMembership.status !== 'ACTIVE') {
        throw forbiddenError();
      }

      const actorRole = actorMembership.role;

      const before = await this.options.memberships.findById(
        actor.organizationId,
        membershipId,
        tx,
      );

      if (before === null) {
        throw membershipNotFoundError();
      }

      const resultingRole = input.role ?? before.role;

      if (actorRole === 'ADMIN' && (before.role === 'OWNER' || resultingRole === 'OWNER')) {
        throw forbiddenError();
      }

      if (ROLE_RANK[resultingRole] > ROLE_RANK[actorRole]) {
        throw forbiddenError();
      }

      if (
        before.userId === actor.userId &&
        input.role !== undefined &&
        ROLE_RANK[input.role] > ROLE_RANK[before.role]
      ) {
        throw forbiddenError();
      }

      const resultingStatus = input.status ?? before.status;
      const losesOwner =
        before.role === 'OWNER' &&
        before.status === 'ACTIVE' &&
        (resultingRole !== 'OWNER' || resultingStatus !== 'ACTIVE');

      if (losesOwner) {
        const otherOwners = await this.options.memberships.countActiveOwners(
          actor.organizationId,
          membershipId,
          tx,
        );

        if (otherOwners === 0) {
          throw lastOwnerProtectedError();
        }
      }

      const after = await this.options.memberships.update(
        actor.organizationId,
        membershipId,
        {
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.status === undefined
            ? {}
            : {
                status: input.status,
                disabledAt: input.status === 'DISABLED' ? this.options.clock.now() : null,
              }),
        },
        tx,
      );

      // Revoke inside the same transaction so a committed disable can never
      // leave an active session behind. A revocation failure rolls back the
      // membership update, keeping the operation retryable and fail-closed.
      // The condition is intentionally status-based, not transition-based, so
      // retrying a disable also cleans up sessions left by a previous crash.
      if (after.status === 'DISABLED') {
        await this.options.auth.revokeUserSessions(
          after.userId,
          actor.organizationId,
          this.options.clock.now(),
          tx,
        );
      }

      let releasedEvents = 0;

      if (
        before.role === 'EVENT_MANAGER' &&
        (after.role !== 'EVENT_MANAGER' || after.status === 'DISABLED')
      ) {
        releasedEvents = await this.options.memberships.releaseManagedEvents(
          actor.organizationId,
          membershipId,
          tx,
        );
      }

      return { before, after, releasedEvents };
    });
  }

  private async recordAudit(event: AuditEvent): Promise<void> {
    try {
      await this.options.audit.record(event);
    } catch (error) {
      this.options.logger.error(
        sanitizedErrorFields(error),
        'Failed to record membership audit event',
      );
    }
  }
}
