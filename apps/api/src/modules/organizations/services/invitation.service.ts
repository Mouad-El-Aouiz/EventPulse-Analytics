import { randomBytes } from 'node:crypto';
import type { Invitation, Role } from '@prisma/client';
import type { Logger } from 'pino';
import { sanitizedErrorFields } from '../../../errors/error-logging.js';
import type {
  InvitationAccountGateway,
  InvitationAccountUser,
  IssuedInvitationSession,
} from '../../../shared/contracts/invitation-account-gateway.js';
import type { OrganizationsFacade } from '../../../shared/contracts/organizations-facade.js';
import { hashTokenWithPepper } from '../../../shared/crypto/token-hash.js';
import { forbiddenError } from '../../../shared/http/authorization.js';
import type { AuditEvent, AuditPort } from '../../../shared/ports/audit.port.js';
import type { Clock } from '../../../shared/ports/clock.port.js';
import type { MailPort } from '../../../shared/ports/mail.port.js';
import type { ActorContext, AuthContext } from '../../../shared/types/actor-context.js';
import type { AuthFacade } from '../../auth/auth.facade.js';
import {
  invitationDeliveryFailedError,
  invitationEmailMismatchError,
  invitationInvalidError,
  invitationNotFoundError,
  invitationNotPendingError,
  membershipAlreadyExistsError,
  organizationNotFoundError,
} from '../organizations.errors.js';
import type {
  AcceptInvitationWithTokenInput,
  CreateInvitationInput,
  InvitationView,
  RequestMetadata,
} from '../organizations.types.js';
import type { InvitationRepository } from '../repositories/invitation.repository.js';
import type { MembershipRepository } from '../repositories/membership.repository.js';
import type { OrganizationRepository } from '../repositories/organization.repository.js';
import type { PrismaOrganizationsUnitOfWork } from '../repositories/organizations-unit-of-work.js';

const MAX_DISPLAY_NAME_LENGTH = 150;
const UNDELIVERED_REVOCATION_ATTEMPTS = 3;
const UNDELIVERED_REVOCATION_BACKOFF_MS = 25;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export interface InvitationServiceOptions {
  invitations: InvitationRepository;
  memberships: MembershipRepository;
  organizations: OrganizationRepository;
  facade: OrganizationsFacade;
  unitOfWork: PrismaOrganizationsUnitOfWork;
  auth: AuthFacade;
  invitationAccounts: InvitationAccountGateway;
  mail: MailPort;
  audit: AuditPort;
  clock: Clock;
  logger: Logger;
  tokenPepper: string;
  ttlSeconds: number;
}

type AcceptOutcome =
  | { kind: 'accepted'; invitation: Invitation; membershipId: string }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'mismatch' }
  | { kind: 'already_member' };

type TokenAcceptOutcome =
  | {
      kind: 'accepted';
      invitation: Invitation;
      membershipId: string;
      user: InvitationAccountUser;
      session: IssuedInvitationSession;
      accountCreated: boolean;
    }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'already_member' }
  | { kind: 'inactive' };

export interface AcceptedInvitation {
  membershipId: string;
  organizationId: string;
  role: Role;
}

export interface AcceptedInvitationWithSession extends IssuedInvitationSession {
  membershipId: string;
  organizationId: string;
  role: Role;
}

function normalizeDisplayName(displayName: string | undefined, email: string): string {
  const trimmed = displayName?.trim();

  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
  }

  const localPart = email.split('@')[0]?.trim();

  return (localPart !== undefined && localPart.length > 0 ? localPart : 'Invited user').slice(
    0,
    MAX_DISPLAY_NAME_LENGTH,
  );
}

export class InvitationService {
  constructor(private readonly options: InvitationServiceOptions) {}

  async list(actor: ActorContext): Promise<InvitationView[]> {
    const invitations = await this.options.invitations.list(actor.organizationId);
    const now = this.options.clock.now();

    return invitations.map((invitation) => this.toView(invitation, now));
  }

  async create(
    actor: ActorContext,
    input: CreateInvitationInput,
    metadata: RequestMetadata,
  ): Promise<InvitationView> {
    const inviter = await this.options.auth.getUser(actor.userId);

    if (inviter === null || !inviter.isActive) {
      throw forbiddenError();
    }

    const organization = await this.options.facade.getSettings(actor.organizationId);

    if (organization === null) {
      throw organizationNotFoundError();
    }

    await this.options.mail.assertAvailable();

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashTokenWithPepper(token, this.options.tokenPepper);
    const now = this.options.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.ttlSeconds * 1000);

    const invitation = await this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);

      const actorMembership = await this.options.memberships.findById(
        actor.organizationId,
        actor.membershipId,
        tx,
      );

      if (
        actorMembership === null ||
        actorMembership.status !== 'ACTIVE' ||
        (actorMembership.role !== 'OWNER' && actorMembership.role !== 'ADMIN')
      ) {
        throw forbiddenError();
      }

      if (actorMembership.role === 'ADMIN' && input.role === 'OWNER') {
        throw forbiddenError();
      }

      await this.options.invitations.expirePendingForEmail(
        actor.organizationId,
        input.email,
        now,
        tx,
      );

      const existingMember = await this.options.memberships.findByEmail(
        actor.organizationId,
        input.email,
        tx,
      );

      if (existingMember !== null) {
        throw membershipAlreadyExistsError();
      }

      return this.options.invitations.create(
        {
          organizationId: actor.organizationId,
          email: input.email,
          role: input.role,
          tokenHash,
          invitedByUserId: actor.userId,
          expiresAt,
        },
        tx,
      );
    });

    try {
      await this.options.mail.sendOrganizationInvitation({
        to: input.email,
        organizationName: organization.name,
        inviterName: inviter.displayName,
        role: input.role,
        invitationToken: token,
        expiresAt,
      });
    } catch (error) {
      this.options.logger.error(
        { ...sanitizedErrorFields(error), invitationId: invitation.id },
        'Invitation email delivery failed; revoking invitation',
      );

      await this.revokeUndeliveredInvitation(invitation);

      throw invitationDeliveryFailedError(error);
    }

    await this.recordAudit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'USERS_ROLES',
      actionType: 'INVITATION_CREATED',
      resourceType: 'invitation',
      resourceId: invitation.id,
      result: 'SUCCESS',
      metadata: { role: invitation.role },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.toView(invitation, now);
  }

  async revoke(
    actor: ActorContext,
    invitationId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const invitation = await this.options.unitOfWork.run(async (tx) => {
      await this.options.organizations.lockById(actor.organizationId, tx);

      const actorMembership = await this.options.memberships.findById(
        actor.organizationId,
        actor.membershipId,
        tx,
      );

      if (
        actorMembership === null ||
        actorMembership.status !== 'ACTIVE' ||
        (actorMembership.role !== 'OWNER' && actorMembership.role !== 'ADMIN')
      ) {
        throw forbiddenError();
      }

      const current = await this.options.invitations.findById(
        actor.organizationId,
        invitationId,
        tx,
      );

      if (current === null) {
        throw invitationNotFoundError();
      }

      const revoked = await this.options.invitations.revokePending(
        actor.organizationId,
        invitationId,
        this.options.clock.now(),
        tx,
      );

      if (revoked === 0) {
        throw invitationNotPendingError();
      }

      return current;
    });

    await this.recordAudit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'USERS_ROLES',
      actionType: 'INVITATION_REVOKED',
      resourceType: 'invitation',
      resourceId: invitationId,
      result: 'SUCCESS',
      metadata: { role: invitation.role },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  /**
   * Authenticated acceptance kept for clients that already hold a session.
   * The target organization always comes from the invitation row, never from
   * the caller's current tenant.
   */
  async accept(
    actor: AuthContext,
    token: string,
    metadata: RequestMetadata,
  ): Promise<AcceptedInvitation> {
    const user = await this.options.auth.getUser(actor.userId);

    if (user === null || !user.isActive) {
      throw invitationInvalidError();
    }

    const tokenHash = hashTokenWithPepper(token, this.options.tokenPepper);
    const now = this.options.clock.now();

    const outcome = await this.options.unitOfWork.run<AcceptOutcome>(async (tx) => {
      const probe = await this.options.invitations.findByTokenHash(tokenHash, tx);

      if (probe === null) {
        return { kind: 'invalid' };
      }

      // Acquire the organization before the invitation row so acceptance shares the
      // org -> invitation order used by creation and revocation.
      await this.options.organizations.lockById(probe.organizationId, tx);
      await this.options.invitations.lockByTokenHash(tokenHash, tx);

      const invitation = await this.options.invitations.findByTokenHash(tokenHash, tx);

      if (invitation === null || invitation.status !== 'PENDING') {
        return { kind: 'invalid' };
      }

      if (invitation.expiresAt.getTime() <= now.getTime()) {
        await this.options.invitations.markExpired(invitation.organizationId, invitation.id, tx);
        return { kind: 'expired' };
      }

      if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        return { kind: 'mismatch' };
      }

      const existing = await this.options.memberships.findByOrgAndUser(
        invitation.organizationId,
        actor.userId,
        tx,
      );

      if (existing !== null) {
        if (existing.status !== 'ACTIVE' || existing.role !== invitation.role) {
          // Never consume a pending invitation on a membership conflict.
          return { kind: 'already_member' };
        }

        // An active member with the invited role accepts idempotently: the
        // token is consumed and the existing membership is returned without
        // changing its role or issuing another session.
        const consumed = await this.options.invitations.markAccepted(
          invitation.organizationId,
          invitation.id,
          now,
          tx,
        );

        if (consumed !== 1) {
          throw invitationInvalidError();
        }

        return { kind: 'accepted', invitation, membershipId: existing.id };
      }

      const consumed = await this.options.invitations.markAccepted(
        invitation.organizationId,
        invitation.id,
        now,
        tx,
      );

      if (consumed !== 1) {
        throw invitationInvalidError();
      }

      const membership = await this.options.memberships.create(
        invitation.organizationId,
        actor.userId,
        invitation.role,
        tx,
      );

      return { kind: 'accepted', invitation, membershipId: membership.id };
    });

    if (outcome.kind === 'invalid' || outcome.kind === 'expired') {
      throw invitationInvalidError();
    }

    if (outcome.kind === 'mismatch') {
      throw invitationEmailMismatchError();
    }

    if (outcome.kind === 'already_member') {
      throw membershipAlreadyExistsError();
    }

    await this.recordAudit({
      organizationId: outcome.invitation.organizationId,
      actorUserId: actor.userId,
      category: 'USERS_ROLES',
      actionType: 'INVITATION_ACCEPTED',
      resourceType: 'invitation',
      resourceId: outcome.invitation.id,
      result: 'SUCCESS',
      metadata: { role: outcome.invitation.role, accountCreated: false },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return {
      membershipId: outcome.membershipId,
      organizationId: outcome.invitation.organizationId,
      role: outcome.invitation.role,
    };
  }

  /**
   * Public, unauthenticated acceptance. The emailed token is the only proof of
   * address ownership; the target organization is derived exclusively from the
   * invitation row. Account, membership, invitation status, and session are
   * written in one transaction.
   */
  async acceptWithToken(
    input: AcceptInvitationWithTokenInput,
    metadata: RequestMetadata,
  ): Promise<AcceptedInvitationWithSession> {
    const passwordHash = await this.options.invitationAccounts.hashPassword(input.password);
    const tokenHash = hashTokenWithPepper(input.token, this.options.tokenPepper);
    const now = this.options.clock.now();

    const outcome = await this.options.unitOfWork.run<TokenAcceptOutcome>(async (tx) => {
      const probe = await this.options.invitations.findByTokenHash(tokenHash, tx);

      if (probe === null) {
        return { kind: 'invalid' };
      }

      // Acquire the organization before the invitation row so acceptance shares the
      // org -> invitation order used by creation and revocation.
      await this.options.organizations.lockById(probe.organizationId, tx);
      await this.options.invitations.lockByTokenHash(tokenHash, tx);

      const invitation = await this.options.invitations.findByTokenHash(tokenHash, tx);

      if (invitation === null || invitation.status !== 'PENDING') {
        return { kind: 'invalid' };
      }

      if (invitation.expiresAt.getTime() <= now.getTime()) {
        await this.options.invitations.markExpired(invitation.organizationId, invitation.id, tx);
        return { kind: 'expired' };
      }

      let user = await this.options.invitationAccounts.findUserByEmail(invitation.email, tx);

      if (user !== null && !user.isActive) {
        return { kind: 'inactive' };
      }

      const organization = await this.options.organizations.findById(invitation.organizationId, tx);

      if (organization === null) {
        throw organizationNotFoundError();
      }

      const existing =
        user === null
          ? null
          : await this.options.memberships.findByOrgAndUser(invitation.organizationId, user.id, tx);

      if (existing !== null && user !== null) {
        if (existing.status !== 'ACTIVE' || existing.role !== invitation.role) {
          return { kind: 'already_member' };
        }

        // Already an active member with the invited role: consume the token and
        // issue a session without creating an account or changing credentials.
        const consumed = await this.options.invitations.markAccepted(
          invitation.organizationId,
          invitation.id,
          now,
          tx,
        );

        if (consumed !== 1) {
          throw invitationInvalidError();
        }

        const session = await this.options.invitationAccounts.issueSession(
          {
            user,
            organization,
            role: invitation.role,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
          tx,
        );

        await this.options.invitationAccounts.updateLastLogin(user.id, now, tx);

        return {
          kind: 'accepted',
          invitation,
          membershipId: existing.id,
          user,
          session,
          accountCreated: false,
        };
      }

      let accountCreated = false;

      if (user === null) {
        const provisioned = await this.options.invitationAccounts.provisionUser(
          {
            email: invitation.email,
            displayName: normalizeDisplayName(input.displayName, invitation.email),
            passwordHash,
          },
          tx,
        );

        user = provisioned.user;
        accountCreated = provisioned.created;

        if (!user.isActive) {
          return { kind: 'inactive' };
        }
      }

      const consumed = await this.options.invitations.markAccepted(
        invitation.organizationId,
        invitation.id,
        now,
        tx,
      );

      if (consumed !== 1) {
        throw invitationInvalidError();
      }

      const membership = await this.options.memberships.create(
        invitation.organizationId,
        user.id,
        invitation.role,
        tx,
      );

      const session = await this.options.invitationAccounts.issueSession(
        {
          user,
          organization,
          role: invitation.role,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
        tx,
      );

      await this.options.invitationAccounts.updateLastLogin(user.id, now, tx);

      return {
        kind: 'accepted',
        invitation,
        membershipId: membership.id,
        user,
        session,
        accountCreated,
      };
    });

    if (outcome.kind === 'invalid' || outcome.kind === 'expired' || outcome.kind === 'inactive') {
      throw invitationInvalidError();
    }

    if (outcome.kind === 'already_member') {
      throw membershipAlreadyExistsError();
    }

    await this.recordAudit({
      organizationId: outcome.invitation.organizationId,
      actorUserId: outcome.user.id,
      category: 'USERS_ROLES',
      actionType: 'INVITATION_ACCEPTED',
      resourceType: 'invitation',
      resourceId: outcome.invitation.id,
      result: 'SUCCESS',
      metadata: {
        role: outcome.invitation.role,
        accountCreated: outcome.accountCreated,
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return {
      ...outcome.session,
      membershipId: outcome.membershipId,
      organizationId: outcome.invitation.organizationId,
      role: outcome.invitation.role,
    };
  }

  private async revokeUndeliveredInvitation(invitation: Invitation): Promise<void> {
    for (let attempt = 1; attempt <= UNDELIVERED_REVOCATION_ATTEMPTS; attempt += 1) {
      try {
        await this.options.invitations.markRevoked(
          invitation.organizationId,
          invitation.id,
          this.options.clock.now(),
        );

        return;
      } catch (error) {
        const finalAttempt = attempt === UNDELIVERED_REVOCATION_ATTEMPTS;

        this.options.logger.error(
          {
            ...sanitizedErrorFields(error),
            event: 'INVITATION_REVOCATION_FAILED',
            invitationId: invitation.id,
            organizationId: invitation.organizationId,
            attempt,
            maxAttempts: UNDELIVERED_REVOCATION_ATTEMPTS,
            requiresManualRevocation: finalAttempt,
          },
          finalAttempt
            ? 'Undelivered invitation could not be revoked; manual revocation required'
            : 'Failed to revoke undelivered invitation; retrying',
        );

        if (finalAttempt) {
          return;
        }

        await delay(UNDELIVERED_REVOCATION_BACKOFF_MS * attempt);
      }
    }
  }

  private toView(invitation: Invitation, now: Date): InvitationView {
    const status =
      invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= now.getTime()
        ? 'EXPIRED'
        : invitation.status;

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status,
      invitedByUserId: invitation.invitedByUserId,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    };
  }

  private async recordAudit(event: AuditEvent): Promise<void> {
    try {
      await this.options.audit.record(event);
    } catch (error) {
      this.options.logger.error(
        sanitizedErrorFields(error),
        'Failed to record invitation audit event',
      );
    }
  }
}
