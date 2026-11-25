import type { User } from '@prisma/client';
import type { Logger } from 'pino';
import type {
  ActiveMembership,
  OrganizationsReader,
} from '../../shared/contracts/organizations-reader.js';
import { errorLogFields } from '../../errors/error-logging.js';
import type { AuditEvent, AuditPort } from '../../shared/ports/audit.port.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { RateLimiter } from '../../shared/rate-limit/rate-limiter.js';
import { RateLimitError } from '../../shared/rate-limit/rate-limit.errors.js';
import type { ActorContext, AuthContext } from '../../shared/types/actor-context.js';
import {
  accountDisabledError,
  invalidCredentialsError,
  noActiveMembershipError,
  organizationRequiredError,
  sessionNotFoundError,
  sessionRevokedError,
  sessionExpiredError,
  tokenInvalidError,
} from './auth.errors.js';
import { toAuthOrganizationView, toAuthUserView, toSessionView } from './auth.mapper.js';
import type {
  AuthResult,
  LogoutResult,
  MeResponse,
  RequestMetadata,
  SessionView,
} from './auth.types.js';
import type { SessionRepository } from './repositories/session.repository.js';
import type { UserRepository } from './repositories/user.repository.js';
import type { PasswordResetService } from './services/password-reset.service.js';
import type { PasswordService } from './services/password.service.js';
import type { SessionService } from './services/session.service.js';
import { hashTokenWithPepper } from './services/token-hash.js';
import type { TokenService } from './services/token.service.js';

export interface LoginInput extends RequestMetadata {
  email: string;
  password: string;
  organizationId?: string;
}

export interface AuthServiceOptions {
  users: UserRepository;
  sessions: SessionRepository;
  organizations: OrganizationsReader;
  audit: AuditPort;
  passwords: PasswordService;
  tokens: TokenService;
  sessionService: SessionService;
  passwordResetService: PasswordResetService;
  rateLimiter: RateLimiter;
  clock: Clock;
  logger: Logger;
  refreshPepper: string;
  resetPepper: string;
  loginLimit: { maxAttempts: number; windowSeconds: number };
  forgotLimit: { maxAttempts: number; windowSeconds: number };
  refreshLimit: { maxAttempts: number; windowSeconds: number };
  lockout: { threshold: number; baseSeconds: number; maxSeconds: number };
  forgotTimingFloorMs?: number;
}

export interface AuditFlushResult {
  drained: boolean;
  pending: number;
}

const DEFAULT_AUDIT_FLUSH_TIMEOUT_MS = 5_000;
const DEFAULT_FORGOT_TIMING_FLOOR_MS = 250;
const UNKNOWN_IP = 'unknown';

const LOGIN_FAILURE_SCOPE = 'login-failure';
const LOGIN_RATE_SCOPE = 'login-rate';
const FORGOT_SCOPE = 'forgot';
const FORGOT_ACCOUNT_SCOPE = 'forgot-account';
const RESET_IP_SCOPE = 'reset-ip';
const REFRESH_IP_SCOPE = 'refresh-ip';
const REFRESH_SCOPE = 'refresh';

const AUDIT_RESOURCE_SESSION = 'session';
const AUDIT_RESOURCE_USER = 'user';
const AUDIT_RESOURCE_RESET = 'password_reset';

async function settleBeforeDeadline(
  promises: readonly Promise<void>[],
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      Promise.allSettled(promises).then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function withMinimumDuration<T>(task: () => Promise<T>, minimumMs: number): Promise<T> {
  const startedAt = Date.now();

  try {
    return await task();
  } finally {
    const remainingMs = minimumMs - (Date.now() - startedAt);

    if (remainingMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
    }
  }
}

export class AuthService {
  private readonly pendingAudits = new Set<Promise<void>>();

  constructor(private readonly options: AuthServiceOptions) {}

  private get forgotTimingFloorMs(): number {
    return this.options.forgotTimingFloorMs ?? DEFAULT_FORGOT_TIMING_FLOOR_MS;
  }

  private async audit(event: AuditEvent): Promise<void> {
    try {
      await this.options.audit.record(event);
    } catch (error) {
      this.options.logger.warn(
        { ...errorLogFields(error), actionType: event.actionType },
        'Auth audit write failed',
      );
    }
  }

  private scheduleAudit(task: Promise<void>, actionType: string): void {
    const guarded = task.catch((error: unknown) => {
      this.options.logger.warn({ ...errorLogFields(error), actionType }, 'Auth audit write failed');
    });

    this.pendingAudits.add(guarded);
    void guarded.finally(() => {
      this.pendingAudits.delete(guarded);
    });
  }

  async flushBackgroundAudits(
    timeoutMs = DEFAULT_AUDIT_FLUSH_TIMEOUT_MS,
  ): Promise<AuditFlushResult> {
    const deadline = Date.now() + Math.max(0, timeoutMs);

    while (this.pendingAudits.size > 0) {
      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        return { drained: false, pending: this.pendingAudits.size };
      }

      const settled = await settleBeforeDeadline([...this.pendingAudits], remainingMs);

      if (!settled) {
        return { drained: false, pending: this.pendingAudits.size };
      }
    }

    return { drained: true, pending: 0 };
  }

  private async auditFailureForUser(
    userId: string,
    requestedOrganizationId: string | undefined,
    actionType: string,
    metadata: Record<string, unknown>,
    context: RequestMetadata,
  ): Promise<void> {
    const organizationId = await this.resolveAuditOrganization(userId, requestedOrganizationId);

    if (organizationId === null) {
      this.options.logger.warn(
        { actionType, reason: metadata.reason },
        'Auth failure has no resolvable organization for audit',
      );
      return;
    }

    await this.audit({
      organizationId,
      actorUserId: userId,
      category: 'AUTH',
      actionType,
      resourceType: AUDIT_RESOURCE_USER,
      resourceId: userId,
      result: 'FAILURE',
      metadata,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private async resolveAuditOrganization(
    userId: string,
    requestedOrganizationId?: string,
  ): Promise<string | null> {
    if (requestedOrganizationId !== undefined) {
      const membership = await this.options.organizations.getActiveMembership(
        userId,
        requestedOrganizationId,
      );
      return membership?.organization.id ?? null;
    }

    const memberships = await this.options.organizations.listActiveMemberships(userId);

    return memberships.length === 1 ? (memberships[0]?.organization.id ?? null) : null;
  }

  private selectOrganization(
    memberships: readonly ActiveMembership[],
    organizationId?: string,
  ): ActiveMembership {
    if (organizationId !== undefined) {
      const selected = memberships.find(
        (membership) => membership.organization.id === organizationId,
      );

      if (selected === undefined) {
        throw noActiveMembershipError();
      }

      return selected;
    }

    if (memberships.length === 0) {
      throw noActiveMembershipError();
    }

    if (memberships.length > 1) {
      throw organizationRequiredError();
    }

    return memberships[0] as ActiveMembership;
  }

  private async issueResult(
    user: User,
    membership: ActiveMembership,
    session: { id: string },
    refreshToken: string,
  ): Promise<AuthResult> {
    const accessToken = await this.options.tokens.signAccessToken({
      userId: user.id,
      sessionId: session.id,
      organizationId: membership.organization.id,
      role: membership.role,
    });

    return {
      body: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.options.tokens.accessTtlSeconds,
        user: toAuthUserView(user),
        activeOrganization: toAuthOrganizationView(membership),
      },
      refreshToken,
      refreshMaxAgeSeconds: this.options.sessionService.slidingTtlSeconds,
    };
  }

  private async issueResultWithCleanup(
    user: User,
    membership: ActiveMembership,
    session: { id: string },
    refreshToken: string,
  ): Promise<AuthResult> {
    try {
      return await this.issueResult(user, membership, session, refreshToken);
    } catch (error) {
      try {
        await this.options.sessions.revokeCurrent(session.id, this.options.clock.now());
      } catch (revokeError) {
        this.options.logger.error(
          errorLogFields(revokeError),
          'Failed to revoke session after access-token signing failure',
        );
      }

      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const context: RequestMetadata = {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    // Lockout is scoped to account+IP so knowing an email address cannot let an
    // attacker durably lock the account for its owner. The account+IP rate
    // limiter below still caps attempts from each source.
    const lockIdentifiers = [email, input.ipAddress ?? UNKNOWN_IP];
    const lockSeconds = await this.options.rateLimiter.getLockSeconds(
      LOGIN_FAILURE_SCOPE,
      lockIdentifiers,
    );

    if (lockSeconds > 0) {
      throw new RateLimitError(lockSeconds);
    }

    const decision = await this.options.rateLimiter.consume(
      LOGIN_RATE_SCOPE,
      [input.ipAddress ?? 'unknown', email],
      this.options.loginLimit.maxAttempts,
      this.options.loginLimit.windowSeconds,
    );

    if (!decision.allowed) {
      throw new RateLimitError(decision.retryAfterSeconds);
    }

    const user = await this.options.users.findByEmail(email);
    const passwordValid =
      user === null
        ? await this.options.passwords.verifyAgainstDummyHash(input.password)
        : await this.options.passwords.verify(user.passwordHash, input.password);

    if (!passwordValid) {
      await this.options.rateLimiter.recordFailure(LOGIN_FAILURE_SCOPE, lockIdentifiers, {
        threshold: this.options.lockout.threshold,
        baseSeconds: this.options.lockout.baseSeconds,
        maxSeconds: this.options.lockout.maxSeconds,
      });

      if (user !== null) {
        // Keep the known-account path off the response path: awaiting the
        // membership lookup and audit insert here would make it measurably
        // slower than the unknown-account path.
        this.scheduleAudit(
          this.auditFailureForUser(
            user.id,
            input.organizationId,
            'AUTH_LOGIN_FAILED',
            { reason: 'INVALID_CREDENTIALS' },
            context,
          ),
          'AUTH_LOGIN_FAILED',
        );
      } else {
        this.options.logger.warn({ reason: 'INVALID_CREDENTIALS' }, 'Anonymous login failure');
      }

      throw invalidCredentialsError();
    }

    if (user === null) {
      throw invalidCredentialsError();
    }

    if (!user.isActive) {
      await this.auditFailureForUser(
        user.id,
        input.organizationId,
        'AUTH_LOGIN_FAILED',
        { reason: 'ACCOUNT_DISABLED' },
        context,
      );
      throw accountDisabledError();
    }

    const memberships = await this.options.organizations.listActiveMemberships(user.id);
    let membership: ActiveMembership;

    try {
      membership = this.selectOrganization(memberships, input.organizationId);
    } catch (error) {
      await this.auditFailureForUser(
        user.id,
        input.organizationId,
        'AUTH_LOGIN_FAILED',
        { reason: 'NO_ACTIVE_MEMBERSHIP' },
        context,
      );
      throw error;
    }

    const issued = await this.options.sessionService.create({
      userId: user.id,
      organizationId: membership.organization.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    try {
      await this.options.users.updateLastLogin(user.id, this.options.clock.now());
      await this.options.rateLimiter.clearFailures(LOGIN_FAILURE_SCOPE, lockIdentifiers);
    } catch (error) {
      // Do not leave an active session that the client never received.
      try {
        await this.options.sessions.revokeCurrent(issued.session.id, this.options.clock.now());
      } catch (revokeError) {
        this.options.logger.error(
          errorLogFields(revokeError),
          'Failed to revoke session after login finalization failure',
        );
      }

      throw error;
    }

    const result = await this.issueResultWithCleanup(
      user,
      membership,
      issued.session,
      issued.refreshToken,
    );

    await this.audit({
      organizationId: membership.organization.id,
      actorUserId: user.id,
      category: 'AUTH',
      actionType: 'AUTH_LOGIN_SUCCEEDED',
      resourceType: AUDIT_RESOURCE_USER,
      resourceId: user.id,
      result: 'SUCCESS',
      metadata: { sessionId: issued.session.id },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return result;
  }

  private async loadSessionForRefresh(rawToken: string) {
    const tokenHash = hashTokenWithPepper(rawToken, this.options.refreshPepper);
    return this.options.sessions.findByRefreshTokenHash(tokenHash);
  }

  async refresh(rawToken: string, context: RequestMetadata): Promise<AuthResult> {
    // Limit before any token lookup so invalid tokens cannot bypass the limiter.
    const ipDecision = await this.options.rateLimiter.consume(
      REFRESH_IP_SCOPE,
      [context.ipAddress ?? 'unknown'],
      this.options.refreshLimit.maxAttempts,
      this.options.refreshLimit.windowSeconds,
    );

    if (!ipDecision.allowed) {
      throw new RateLimitError(ipDecision.retryAfterSeconds);
    }

    const session = await this.loadSessionForRefresh(rawToken);

    if (session === null) {
      throw tokenInvalidError();
    }

    const decision = await this.options.rateLimiter.consume(
      REFRESH_SCOPE,
      [session.familyId],
      this.options.refreshLimit.maxAttempts,
      this.options.refreshLimit.windowSeconds,
    );

    if (!decision.allowed) {
      throw new RateLimitError(decision.retryAfterSeconds);
    }

    const now = this.options.clock.now();

    if (session.revokedAt !== null) {
      await this.options.sessions.revokeFamily(session.familyId, now);

      if (session.organizationId !== null) {
        await this.audit({
          organizationId: session.organizationId,
          actorUserId: session.userId,
          category: 'AUTH',
          actionType: 'AUTH_REFRESH_REUSE_DETECTED',
          resourceType: AUDIT_RESOURCE_SESSION,
          resourceId: session.id,
          result: 'FAILURE',
          metadata: {},
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      throw sessionRevokedError();
    }

    if (this.options.sessionService.isExpired(session, now)) {
      await this.options.sessions.revokeCurrent(session.id, now);
      throw sessionExpiredError();
    }

    const user = await this.options.users.findById(session.userId);

    if (user === null) {
      await this.options.sessions.revokeFamily(session.familyId, now);
      throw tokenInvalidError();
    }

    if (!user.isActive) {
      await this.options.sessions.revokeFamily(session.familyId, now);
      throw accountDisabledError();
    }

    if (session.organizationId === null) {
      await this.options.sessions.revokeFamily(session.familyId, now);
      throw noActiveMembershipError();
    }

    const membership = await this.options.organizations.getActiveMembership(
      user.id,
      session.organizationId,
    );

    if (membership === null) {
      await this.options.sessions.revokeFamily(session.familyId, now);
      throw noActiveMembershipError();
    }

    const rotation = await this.options.sessionService.rotate({
      session,
      organizationId: membership.organization.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    if (rotation.status === 'reuse') {
      await this.options.sessions.revokeFamily(rotation.session.familyId, now);

      if (session.organizationId !== null) {
        await this.audit({
          organizationId: session.organizationId,
          actorUserId: session.userId,
          category: 'AUTH',
          actionType: 'AUTH_REFRESH_REUSE_DETECTED',
          resourceType: AUDIT_RESOURCE_SESSION,
          resourceId: session.id,
          result: 'FAILURE',
          metadata: {},
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      throw sessionRevokedError();
    }

    if (rotation.status === 'invalid') {
      throw tokenInvalidError();
    }

    return this.issueResultWithCleanup(
      user,
      membership,
      rotation.issued.session,
      rotation.issued.refreshToken,
    );
  }

  async logout(
    actor: AuthContext | undefined,
    rawRefreshToken: string | undefined,
    context: RequestMetadata,
  ): Promise<LogoutResult> {
    const now = this.options.clock.now();

    if (actor !== undefined) {
      await this.options.sessions.revokeCurrent(actor.sessionId, now);
      await this.audit({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        category: 'AUTH',
        actionType: 'AUTH_LOGOUT',
        resourceType: AUDIT_RESOURCE_SESSION,
        resourceId: actor.sessionId,
        result: 'SUCCESS',
        metadata: {},
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { revokedCurrentSession: true };
    }

    if (rawRefreshToken === undefined) {
      return { revokedCurrentSession: false };
    }

    const tokenHash = hashTokenWithPepper(rawRefreshToken, this.options.refreshPepper);
    const session = await this.options.sessions.findByRefreshTokenHash(tokenHash);

    if (session === null) {
      return { revokedCurrentSession: false };
    }

    await this.options.sessions.revokeCurrent(session.id, now);

    if (session.organizationId !== null) {
      await this.audit({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        category: 'AUTH',
        actionType: 'AUTH_LOGOUT',
        resourceType: AUDIT_RESOURCE_SESSION,
        resourceId: session.id,
        result: 'SUCCESS',
        metadata: {},
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    return { revokedCurrentSession: true };
  }

  async logoutAll(actor: AuthContext, context: RequestMetadata): Promise<void> {
    await this.options.sessions.revokeAllForUser(actor.userId, this.options.clock.now());
    await this.audit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'AUTH',
      actionType: 'AUTH_LOGOUT_ALL',
      resourceType: AUDIT_RESOURCE_USER,
      resourceId: actor.userId,
      result: 'SUCCESS',
      metadata: {},
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async me(actor: ActorContext): Promise<MeResponse> {
    const user = await this.options.users.findById(actor.userId);

    if (user === null) {
      throw tokenInvalidError();
    }

    const memberships = await this.options.organizations.listActiveMemberships(user.id);
    const activeMembership = memberships.find(
      (membership) => membership.organization.id === actor.organizationId,
    );

    if (activeMembership === undefined) {
      throw noActiveMembershipError();
    }

    return {
      user: toAuthUserView(user),
      activeOrganization: toAuthOrganizationView(activeMembership),
      organizations: memberships.map(toAuthOrganizationView),
    };
  }

  async listSessions(actor: ActorContext): Promise<SessionView[]> {
    const sessions = await this.options.sessions.listActiveByUser(
      actor.userId,
      this.options.clock.now(),
    );

    return sessions.map((session) => toSessionView(session, actor.sessionId));
  }

  async revokeSession(
    actor: ActorContext,
    sessionId: string,
    context: RequestMetadata,
  ): Promise<void> {
    const revoked = await this.options.sessions.revokeByIdForUser(
      sessionId,
      actor.userId,
      this.options.clock.now(),
    );

    if (revoked === 0) {
      throw sessionNotFoundError();
    }

    await this.audit({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      category: 'AUTH',
      actionType: 'AUTH_SESSION_REVOKED',
      resourceType: AUDIT_RESOURCE_SESSION,
      resourceId: sessionId,
      result: 'SUCCESS',
      metadata: {},
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async switchOrganization(
    actor: ActorContext,
    organizationId: string,
    context: RequestMetadata,
  ): Promise<AuthResult> {
    const membership = await this.options.organizations.getActiveMembership(
      actor.userId,
      organizationId,
    );

    if (membership === null) {
      throw noActiveMembershipError();
    }

    const user = await this.options.users.findById(actor.userId);

    if (user === null || !user.isActive) {
      throw accountDisabledError();
    }

    const session = await this.options.sessions.findById(actor.sessionId);

    if (session === null) {
      throw tokenInvalidError();
    }

    if (session.revokedAt !== null) {
      throw sessionRevokedError();
    }

    const now = this.options.clock.now();

    if (this.options.sessionService.isExpired(session, now)) {
      throw sessionExpiredError();
    }

    const rotation = await this.options.sessionService.rotate({
      session,
      organizationId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    if (rotation.status === 'reuse') {
      await this.options.sessions.revokeFamily(rotation.session.familyId, now);
      throw sessionRevokedError();
    }

    if (rotation.status === 'invalid') {
      throw tokenInvalidError();
    }

    const result = await this.issueResultWithCleanup(
      user,
      membership,
      rotation.issued.session,
      rotation.issued.refreshToken,
    );

    await this.audit({
      organizationId,
      actorUserId: actor.userId,
      category: 'AUTH',
      actionType: 'AUTH_ORGANIZATION_SWITCHED',
      resourceType: AUDIT_RESOURCE_SESSION,
      resourceId: rotation.issued.session.id,
      result: 'SUCCESS',
      metadata: {},
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return result;
  }

  async forgotPassword(email: string, context: RequestMetadata): Promise<void> {
    const decision = await this.options.rateLimiter.consume(
      FORGOT_SCOPE,
      [context.ipAddress ?? UNKNOWN_IP],
      this.options.forgotLimit.maxAttempts,
      this.options.forgotLimit.windowSeconds,
    );

    if (!decision.allowed) {
      throw new RateLimitError(decision.retryAfterSeconds);
    }

    const normalizedEmail = email.trim().toLowerCase();

    await withMinimumDuration(
      () => this.processForgotPassword(normalizedEmail, context),
      this.forgotTimingFloorMs,
    );
  }

  private async processForgotPassword(
    normalizedEmail: string,
    context: RequestMetadata,
  ): Promise<void> {
    const accountDecision = await this.options.rateLimiter.consume(
      FORGOT_ACCOUNT_SCOPE,
      [normalizedEmail],
      this.options.forgotLimit.maxAttempts,
      this.options.forgotLimit.windowSeconds,
    );

    if (!accountDecision.allowed) {
      // A rejected request must not invalidate a still-valid token. This
      // returns before user lookup and before PasswordResetService.request().
      this.options.logger.warn(
        { reason: 'PASSWORD_RESET_THROTTLED' },
        'Password reset request throttled',
      );
      return;
    }

    const user = await this.options.users.findByEmail(normalizedEmail);

    if (user === null || !user.isActive) {
      // Keep comparable keyed work on the non-delivery paths without
      // persisting a token or sending anything.
      await hashTokenWithPepper(
        this.options.tokens.generateOpaqueToken(),
        this.options.resetPepper,
      );
      return;
    }

    try {
      await this.options.passwordResetService.request(user.id, user.email);
    } catch (error) {
      // Mail availability and delivery failures must not reveal whether the
      // account exists. The caller always returns the same 204 response.
      this.options.logger.warn(
        { ...errorLogFields(error), actionType: 'AUTH_PASSWORD_RESET_REQUESTED' },
        'Password reset delivery failed',
      );
      return;
    }

    this.scheduleAudit(
      (async () => {
        const organizationId = await this.resolveAuditOrganization(user.id);

        if (organizationId === null) {
          return;
        }

        await this.audit({
          organizationId,
          actorUserId: user.id,
          category: 'AUTH',
          actionType: 'AUTH_PASSWORD_RESET_REQUESTED',
          resourceType: AUDIT_RESOURCE_RESET,
          resourceId: user.id,
          result: 'SUCCESS',
          metadata: {},
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      })(),
      'AUTH_PASSWORD_RESET_REQUESTED',
    );
  }

  async resetPassword(token: string, newPassword: string, context: RequestMetadata): Promise<void> {
    const decision = await this.options.rateLimiter.consume(
      RESET_IP_SCOPE,
      [context.ipAddress ?? 'unknown'],
      this.options.forgotLimit.maxAttempts,
      this.options.forgotLimit.windowSeconds,
    );

    if (!decision.allowed) {
      throw new RateLimitError(decision.retryAfterSeconds);
    }

    const completed = await this.options.passwordResetService.reset(token, newPassword);
    const organizationId = await this.resolveAuditOrganization(completed.userId);

    if (organizationId !== null) {
      await this.audit({
        organizationId,
        actorUserId: completed.userId,
        category: 'AUTH',
        actionType: 'AUTH_PASSWORD_RESET_COMPLETED',
        resourceType: AUDIT_RESOURCE_RESET,
        resourceId: completed.resetTokenId,
        result: 'SUCCESS',
        metadata: {},
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }
  }
}
