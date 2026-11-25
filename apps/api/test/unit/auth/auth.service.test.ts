import type { Session, User } from '@prisma/client';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_ACCOUNT_DISABLED,
  AUTH_INVALID_CREDENTIALS,
  AUTH_NO_ACTIVE_MEMBERSHIP,
  AUTH_ORGANIZATION_REQUIRED,
  AUTH_SESSION_EXPIRED,
  AUTH_SESSION_NOT_FOUND,
  AUTH_SESSION_REVOKED,
} from '../../../src/modules/auth/auth.errors.js';
import { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { SessionRepository } from '../../../src/modules/auth/repositories/session.repository.js';
import type { UserRepository } from '../../../src/modules/auth/repositories/user.repository.js';
import type { PasswordResetService } from '../../../src/modules/auth/services/password-reset.service.js';
import type { PasswordService } from '../../../src/modules/auth/services/password.service.js';
import { hashTokenWithPepper } from '../../../src/modules/auth/services/token-hash.js';
import type { SessionService } from '../../../src/modules/auth/services/session.service.js';
import type { TokenService } from '../../../src/modules/auth/services/token.service.js';
import type { ActiveMembership } from '../../../src/shared/contracts/organizations-reader.js';
import type { AuditPort } from '../../../src/shared/ports/audit.port.js';
import type { RateLimiter } from '../../../src/shared/rate-limit/rate-limiter.js';
import type { ActorContext } from '../../../src/shared/types/actor-context.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const REFRESH_PEPPER = 'refresh-pepper';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ORG_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';
const CONTEXT = { ipAddress: '203.0.113.10', userAgent: 'vitest' };

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'user@example.com',
    passwordHash: 'password-hash',
    displayName: 'User Example',
    isActive: true,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function membership(organizationId = ORG_ID, role: ActiveMembership['role'] = 'OWNER') {
  return {
    membershipId: MEMBERSHIP_ID,
    role,
    organization: { id: organizationId, name: 'Acme Events', slug: 'acme-events' },
  };
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    organizationId: ORG_ID,
    familyId: '66666666-6666-4666-8666-666666666666',
    refreshTokenHash: hashTokenWithPepper('raw-refresh-token', REFRESH_PEPPER),
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    absoluteExpiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
    revokedAt: null,
    replacedBySessionId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: NOW,
    lastUsedAt: null,
    ...overrides,
  };
}

function createHarness(options: { forgotTimingFloorMs?: number } = {}) {
  const users = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    updateLastLogin: vi.fn(),
    updatePassword: vi.fn(),
  };
  const sessions = {
    findByRefreshTokenHash: vi.fn(),
    findById: vi.fn(),
    listActiveByUser: vi.fn().mockResolvedValue([]),
    revokeCurrent: vi.fn(),
    revokeAllForUser: vi.fn(),
    revokeFamily: vi.fn(),
    revokeByIdForUser: vi.fn(),
  };
  const organizations = {
    listActiveMemberships: vi.fn().mockResolvedValue([]),
    getActiveMembership: vi.fn().mockResolvedValue(null),
  };
  const audit = { record: vi.fn() };
  const passwords = {
    verify: vi.fn().mockResolvedValue(true),
    verifyAgainstDummyHash: vi.fn().mockResolvedValue(false),
  };
  const tokens = {
    signAccessToken: vi.fn().mockResolvedValue('access-token'),
    accessTtlSeconds: 900,
    generateOpaqueToken: vi.fn().mockReturnValue('opaque-token'),
  };
  const sessionService = {
    create: vi
      .fn()
      .mockResolvedValue({ session: createSession(), refreshToken: 'new-refresh-token' }),
    rotate: vi.fn(),
    isExpired: vi.fn().mockReturnValue(false),
    slidingTtlSeconds: 604_800,
  };
  const passwordResetService = {
    assertMailAvailable: vi.fn(),
    request: vi.fn(),
    reset: vi.fn(),
  };
  const rateLimiter = {
    getLockSeconds: vi.fn().mockResolvedValue(0),
    consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 }),
    recordFailure: vi.fn(),
    clearFailures: vi.fn(),
  };
  const logger = { warn: vi.fn(), error: vi.fn() };

  const service = new AuthService({
    users: users as unknown as UserRepository,
    sessions: sessions as unknown as SessionRepository,
    organizations,
    audit: audit as unknown as AuditPort,
    passwords: passwords as unknown as PasswordService,
    tokens: tokens as unknown as TokenService,
    sessionService: sessionService as unknown as SessionService,
    passwordResetService: passwordResetService as unknown as PasswordResetService,
    rateLimiter: rateLimiter as unknown as RateLimiter,
    clock: { now: () => NOW },
    logger: logger as unknown as Logger,
    refreshPepper: REFRESH_PEPPER,
    resetPepper: 'reset-pepper',
    loginLimit: { maxAttempts: 10, windowSeconds: 900 },
    forgotLimit: { maxAttempts: 5, windowSeconds: 3600 },
    refreshLimit: { maxAttempts: 60, windowSeconds: 3600 },
    lockout: { threshold: 5, baseSeconds: 60, maxSeconds: 86_400 },
    forgotTimingFloorMs: options.forgotTimingFloorMs ?? 0,
  });

  return {
    service,
    users,
    sessions,
    organizations,
    audit,
    passwords,
    tokens,
    sessionService,
    passwordResetService,
    rateLimiter,
    logger,
  };
}

type Harness = ReturnType<typeof createHarness>;

function loginInput(overrides: Record<string, unknown> = {}) {
  return { email: 'user@example.com', password: 'secret', ...CONTEXT, ...overrides };
}

async function expectCode(promise: Promise<unknown>, code: string, statusCode: number) {
  await expect(promise).rejects.toMatchObject({ code, statusCode });
}

describe('AuthService.login', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('performs a dummy hash for unknown accounts and records the failure', async () => {
    harness.users.findByEmail.mockResolvedValue(null);

    await expectCode(harness.service.login(loginInput()), AUTH_INVALID_CREDENTIALS, 401);

    expect(harness.passwords.verifyAgainstDummyHash).toHaveBeenCalledWith('secret');
    expect(harness.rateLimiter.recordFailure).toHaveBeenCalledWith(
      'login-failure',
      ['user@example.com', CONTEXT.ipAddress],
      { threshold: 5, baseSeconds: 60, maxSeconds: 86_400 },
    );
    expect(harness.logger.warn).toHaveBeenCalledWith(
      { reason: 'INVALID_CREDENTIALS' },
      'Anonymous login failure',
    );
    expect(harness.audit.record).not.toHaveBeenCalled();
    expect(harness.sessionService.create).not.toHaveBeenCalled();
  });

  it('does not await the failure audit for a known account', async () => {
    let releaseMemberships: (() => void) | undefined;

    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.passwords.verify.mockResolvedValue(false);
    harness.organizations.listActiveMemberships.mockReturnValue(
      new Promise((resolve) => {
        releaseMemberships = () => resolve([membership()]);
      }),
    );

    await expectCode(harness.service.login(loginInput()), AUTH_INVALID_CREDENTIALS, 401);
    expect(harness.audit.record).not.toHaveBeenCalled();

    releaseMemberships?.();
    await harness.service.flushBackgroundAudits();

    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_LOGIN_FAILED', result: 'FAILURE' }),
    );
  });

  it('revokes a newly created session when access-token signing fails', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);
    harness.tokens.signAccessToken.mockRejectedValueOnce(new Error('signer unavailable'));

    await expect(harness.service.login(loginInput())).rejects.toThrow('signer unavailable');

    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(SESSION_ID, NOW);
    expect(harness.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_LOGIN_SUCCEEDED' }),
    );
  });

  it('verifies the password before revealing that an account is disabled', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser({ isActive: false }));
    harness.passwords.verify.mockResolvedValueOnce(false);

    await expectCode(
      harness.service.login(loginInput({ password: 'wrong' })),
      AUTH_INVALID_CREDENTIALS,
      401,
    );

    harness.passwords.verify.mockResolvedValue(true);
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);

    await expectCode(harness.service.login(loginInput()), AUTH_ACCOUNT_DISABLED, 403);
    expect(harness.sessionService.create).not.toHaveBeenCalled();
  });

  it('blocks the account after progressive lockout is active', async () => {
    harness.rateLimiter.getLockSeconds.mockResolvedValue(120);

    await expect(harness.service.login(loginInput())).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
      statusCode: 429,
      retryAfterSeconds: 120,
    });
    expect(harness.users.findByEmail).not.toHaveBeenCalled();
    expect(harness.rateLimiter.consume).not.toHaveBeenCalled();
    expect(harness.rateLimiter.getLockSeconds).toHaveBeenCalledWith('login-failure', [
      'user@example.com',
      CONTEXT.ipAddress,
    ]);
  });

  it('keeps lockout state separate for different source IPs', async () => {
    const otherIp = '198.51.100.77';
    harness.users.findByEmail.mockResolvedValue(null);

    await expectCode(
      harness.service.login(loginInput({ ipAddress: otherIp })),
      AUTH_INVALID_CREDENTIALS,
      401,
    );

    expect(harness.rateLimiter.getLockSeconds).toHaveBeenCalledWith('login-failure', [
      'user@example.com',
      otherIp,
    ]);
    expect(harness.rateLimiter.recordFailure).toHaveBeenCalledWith(
      'login-failure',
      ['user@example.com', otherIp],
      expect.any(Object),
    );
  });

  it('revokes the new session when the last-login update fails', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);
    harness.users.updateLastLogin.mockRejectedValueOnce(new Error('last login unavailable'));

    await expect(harness.service.login(loginInput())).rejects.toThrow('last login unavailable');

    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(SESSION_ID, NOW);
    expect(harness.rateLimiter.clearFailures).not.toHaveBeenCalled();
  });

  it('revokes the new session when clearing login failures fails', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);
    harness.rateLimiter.clearFailures.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(harness.service.login(loginInput())).rejects.toThrow('redis unavailable');

    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(SESSION_ID, NOW);
    expect(harness.tokens.signAccessToken).not.toHaveBeenCalled();
  });

  it('bounds background audit flushing and reports pending audits', async () => {
    let releaseMemberships: (() => void) | undefined;

    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.passwords.verify.mockResolvedValue(false);
    harness.organizations.listActiveMemberships.mockReturnValue(
      new Promise((resolve) => {
        releaseMemberships = () => resolve([]);
      }),
    );

    await expectCode(harness.service.login(loginInput()), AUTH_INVALID_CREDENTIALS, 401);

    await expect(harness.service.flushBackgroundAudits(10)).resolves.toEqual({
      drained: false,
      pending: 1,
    });

    releaseMemberships?.();
    await expect(harness.service.flushBackgroundAudits(100)).resolves.toEqual({
      drained: true,
      pending: 0,
    });
  });

  it('rejects login when the per-IP/account rate limit is exceeded', async () => {
    harness.rateLimiter.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    await expect(harness.service.login(loginInput())).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
      retryAfterSeconds: 42,
    });
    expect(harness.users.findByEmail).not.toHaveBeenCalled();
  });

  it('requires a selection when the user belongs to several organizations', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([
      membership(ORG_ID),
      membership(OTHER_ORG_ID, 'VIEWER'),
    ]);

    await expectCode(harness.service.login(loginInput()), AUTH_ORGANIZATION_REQUIRED, 409);

    await expectCode(
      harness.service.login(loginInput({ organizationId: '99999999-9999-4999-8999-999999999999' })),
      AUTH_NO_ACTIVE_MEMBERSHIP,
      403,
    );
    expect(harness.sessionService.create).not.toHaveBeenCalled();
  });

  it('rejects login when the user has no active membership', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([]);

    await expectCode(harness.service.login(loginInput()), AUTH_NO_ACTIVE_MEMBERSHIP, 403);
    expect(harness.sessionService.create).not.toHaveBeenCalled();
  });

  it('still completes login when the audit writer fails', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);
    harness.audit.record.mockRejectedValueOnce(new Error('audit database down'));

    await expect(harness.service.login(loginInput())).resolves.toMatchObject({
      body: { accessToken: 'access-token' },
    });

    expect(harness.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_LOGIN_SUCCEEDED' }),
      'Auth audit write failed',
    );
    expect(harness.sessionService.create).toHaveBeenCalledTimes(1);
  });

  it('creates a session, clears failures and audits a successful login', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);

    const result = await harness.service.login(loginInput());

    expect(result).toMatchObject({
      body: {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { id: USER_ID, email: 'user@example.com', displayName: 'User Example' },
        activeOrganization: { id: ORG_ID, role: 'OWNER' },
      },
      refreshToken: 'new-refresh-token',
      refreshMaxAgeSeconds: 604_800,
    });
    expect(harness.sessionService.create).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      ipAddress: CONTEXT.ipAddress,
      userAgent: CONTEXT.userAgent,
    });
    expect(harness.users.updateLastLogin).toHaveBeenCalledWith(USER_ID, NOW);
    expect(harness.rateLimiter.clearFailures).toHaveBeenCalledWith('login-failure', [
      'user@example.com',
      CONTEXT.ipAddress,
    ]);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        actionType: 'AUTH_LOGIN_SUCCEEDED',
        result: 'SUCCESS',
      }),
    );
  });

  it('selects the requested organization explicitly', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.organizations.listActiveMemberships.mockResolvedValue([
      membership(ORG_ID),
      membership(OTHER_ORG_ID, 'VIEWER'),
    ]);

    const result = await harness.service.login(loginInput({ organizationId: OTHER_ORG_ID }));

    expect(result.body.activeOrganization.id).toBe(OTHER_ORG_ID);
    expect(harness.sessionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: OTHER_ORG_ID }),
    );
  });
});

describe('AuthService.refresh', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('rejects unknown refresh tokens without auditing', async () => {
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(null);

    await expectCode(
      harness.service.refresh('raw-refresh-token', CONTEXT),
      'AUTH_TOKEN_INVALID',
      401,
    );
    expect(harness.audit.record).not.toHaveBeenCalled();
  });

  it('applies the IP limiter before looking up the refresh token', async () => {
    harness.rateLimiter.consume.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });

    await expect(harness.service.refresh('raw-refresh-token', CONTEXT)).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
      retryAfterSeconds: 30,
    });

    expect(harness.rateLimiter.consume).toHaveBeenCalledWith(
      'refresh-ip',
      [CONTEXT.ipAddress],
      60,
      3_600,
    );
    expect(harness.sessions.findByRefreshTokenHash).not.toHaveBeenCalled();
  });

  it('keys the session limiter by family rather than the rotating session id', async () => {
    const session = createSession();
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);
    harness.users.findById.mockResolvedValue(createUser());
    harness.organizations.getActiveMembership.mockResolvedValue(membership());
    harness.sessionService.rotate.mockResolvedValue({
      status: 'rotated',
      issued: { session: createSession({ id: 'new-session' }), refreshToken: 'rotated-refresh' },
    });

    await harness.service.refresh('raw-refresh-token', CONTEXT);

    expect(harness.rateLimiter.consume).toHaveBeenCalledWith(
      'refresh',
      [session.familyId],
      60,
      3_600,
    );
    expect(harness.rateLimiter.consume).not.toHaveBeenCalledWith(
      'refresh',
      [session.id],
      60,
      3_600,
    );
  });

  it('limits revoked and reused tokens before reporting reuse', async () => {
    const session = createSession({ revokedAt: NOW });
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);

    await expectCode(
      harness.service.refresh('raw-refresh-token', CONTEXT),
      AUTH_SESSION_REVOKED,
      401,
    );

    expect(harness.rateLimiter.consume).toHaveBeenCalledWith(
      'refresh',
      [session.familyId],
      60,
      3_600,
    );
  });

  it('revokes the whole family and audits refresh-token reuse', async () => {
    const session = createSession({ revokedAt: NOW });
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);

    await expectCode(
      harness.service.refresh('raw-refresh-token', CONTEXT),
      AUTH_SESSION_REVOKED,
      401,
    );

    expect(harness.sessions.revokeFamily).toHaveBeenCalledWith(session.familyId, NOW);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_REFRESH_REUSE_DETECTED', result: 'FAILURE' }),
    );
  });

  it('revokes expired sessions', async () => {
    const session = createSession();
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);
    harness.sessionService.isExpired.mockReturnValue(true);

    await expectCode(
      harness.service.refresh('raw-refresh-token', CONTEXT),
      AUTH_SESSION_EXPIRED,
      401,
    );
    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(SESSION_ID, NOW);
    expect(harness.sessionService.rotate).not.toHaveBeenCalled();
  });

  it('revokes the family when the user is disabled or the membership vanished', async () => {
    const session = createSession();
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);
    harness.users.findById.mockResolvedValue(createUser({ isActive: false }));

    await expectCode(
      harness.service.refresh('raw-refresh-token', CONTEXT),
      AUTH_ACCOUNT_DISABLED,
      403,
    );
    expect(harness.sessions.revokeFamily).toHaveBeenCalledWith(session.familyId, NOW);

    const activeSession = createSession();
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(activeSession);
    harness.users.findById.mockResolvedValue(createUser());
    harness.organizations.getActiveMembership.mockResolvedValue(null);

    await expectCode(
      harness.service.refresh('raw-refresh-token', CONTEXT),
      AUTH_NO_ACTIVE_MEMBERSHIP,
      403,
    );
    expect(harness.sessionService.rotate).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token and returns new credentials', async () => {
    const session = createSession();
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);
    harness.users.findById.mockResolvedValue(createUser());
    harness.organizations.getActiveMembership.mockResolvedValue(membership());
    harness.sessionService.rotate.mockResolvedValue({
      status: 'rotated',
      issued: { session: createSession({ id: 'new-session' }), refreshToken: 'rotated-refresh' },
    });

    const result = await harness.service.refresh('raw-refresh-token', CONTEXT);

    expect(result.refreshToken).toBe('rotated-refresh');
    expect(harness.sessionService.rotate).toHaveBeenCalledWith({
      session,
      organizationId: ORG_ID,
      ipAddress: CONTEXT.ipAddress,
      userAgent: CONTEXT.userAgent,
    });
    expect(harness.tokens.signAccessToken).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: 'new-session',
      organizationId: ORG_ID,
      role: 'OWNER',
    });
  });
});

describe('AuthService.switchOrganization', () => {
  const actor: ActorContext = {
    userId: USER_ID,
    sessionId: SESSION_ID,
    organizationId: ORG_ID,
    roleHint: 'OWNER',
    tokenId: 'jti',
    membershipId: MEMBERSHIP_ID,
    role: 'OWNER',
  };

  it('revokes the rotated session when access-token signing fails', async () => {
    const harness = createHarness();
    const rotatedId = '66666666-6666-4666-8666-666666666666';
    harness.organizations.getActiveMembership.mockResolvedValue(membership(OTHER_ORG_ID));
    harness.users.findById.mockResolvedValue(createUser());
    harness.sessions.findById.mockResolvedValue(createSession());
    harness.sessionService.rotate.mockResolvedValue({
      status: 'rotated',
      issued: { session: createSession({ id: rotatedId }), refreshToken: 'rotated-refresh' },
    });
    harness.tokens.signAccessToken.mockRejectedValueOnce(new Error('signer unavailable'));

    await expect(harness.service.switchOrganization(actor, OTHER_ORG_ID, CONTEXT)).rejects.toThrow(
      'signer unavailable',
    );

    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(rotatedId, NOW);
    expect(harness.audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_ORGANIZATION_SWITCHED' }),
    );
  });
});

describe('AuthService.logout and session management', () => {
  let harness: Harness;
  const actor: ActorContext = {
    userId: USER_ID,
    sessionId: SESSION_ID,
    organizationId: ORG_ID,
    roleHint: 'OWNER',
    tokenId: 'jti',
    membershipId: MEMBERSHIP_ID,
    role: 'OWNER',
  };

  beforeEach(() => {
    harness = createHarness();
  });

  it('revokes the bearer session on logout', async () => {
    await expect(harness.service.logout(actor, undefined, CONTEXT)).resolves.toEqual({
      revokedCurrentSession: true,
    });
    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(SESSION_ID, NOW);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_LOGOUT' }),
    );
  });

  it('falls back to the refresh cookie for logout without a bearer token', async () => {
    const session = createSession();
    harness.sessions.findByRefreshTokenHash.mockResolvedValue(session);

    await expect(harness.service.logout(undefined, 'raw-refresh-token', CONTEXT)).resolves.toEqual({
      revokedCurrentSession: true,
    });
    expect(harness.sessions.findByRefreshTokenHash).toHaveBeenCalledWith(
      hashTokenWithPepper('raw-refresh-token', REFRESH_PEPPER),
    );
    expect(harness.sessions.revokeCurrent).toHaveBeenCalledWith(SESSION_ID, NOW);
  });

  it('is idempotent when no cookie or unknown cookie is presented', async () => {
    await expect(harness.service.logout(undefined, undefined, CONTEXT)).resolves.toEqual({
      revokedCurrentSession: false,
    });

    harness.sessions.findByRefreshTokenHash.mockResolvedValue(null);
    await expect(harness.service.logout(undefined, 'unknown-token', CONTEXT)).resolves.toEqual({
      revokedCurrentSession: false,
    });
  });

  it('revokes only the authenticated user sessions on logout-all', async () => {
    await harness.service.logoutAll(actor, CONTEXT);

    expect(harness.sessions.revokeAllForUser).toHaveBeenCalledWith(USER_ID, NOW);
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_LOGOUT_ALL', resourceType: 'user' }),
    );
  });

  it('reports a missing session when revoking an unknown or foreign session id', async () => {
    harness.sessions.revokeByIdForUser.mockResolvedValue(0);

    await expectCode(
      harness.service.revokeSession(actor, OTHER_ORG_ID, CONTEXT),
      AUTH_SESSION_NOT_FOUND,
      404,
    );
    expect(harness.sessions.revokeByIdForUser).toHaveBeenCalledWith(OTHER_ORG_ID, USER_ID, NOW);
  });

  it('lists sessions with the current one flagged and safe fields only', async () => {
    harness.sessions.listActiveByUser.mockResolvedValue([createSession()]);

    const sessions = await harness.service.listSessions(actor);

    expect(sessions).toEqual([
      {
        id: SESSION_ID,
        createdAt: NOW,
        lastUsedAt: null,
        expiresAt: expect.any(Date),
        absoluteExpiresAt: expect.any(Date),
        ipAddress: null,
        userAgent: null,
        current: true,
      },
    ]);
    expect(JSON.stringify(sessions)).not.toContain('raw-refresh-token');
    expect(JSON.stringify(sessions)).not.toContain('refreshTokenHash');
  });
});

describe('AuthService password reset requests', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it('limits by IP and by hashed account dimension', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.passwordResetService.request.mockResolvedValue(undefined);

    await harness.service.forgotPassword('User@Example.com', CONTEXT);

    expect(harness.rateLimiter.consume).toHaveBeenNthCalledWith(
      1,
      'forgot',
      [CONTEXT.ipAddress],
      5,
      3_600,
    );
    expect(harness.rateLimiter.consume).toHaveBeenNthCalledWith(
      2,
      'forgot-account',
      ['user@example.com'],
      5,
      3_600,
    );
    expect(harness.passwordResetService.request).toHaveBeenCalledWith(USER_ID, 'user@example.com');
  });

  it('returns the same response when the account dimension is throttled', async () => {
    harness.rateLimiter.consume
      .mockResolvedValueOnce({ allowed: true, remaining: 4, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });

    await expect(
      harness.service.forgotPassword('user@example.com', CONTEXT),
    ).resolves.toBeUndefined();

    expect(harness.users.findByEmail).not.toHaveBeenCalled();
    expect(harness.passwordResetService.request).not.toHaveBeenCalled();
  });

  it('does not reveal mail failures for an existing account', async () => {
    harness.users.findByEmail.mockResolvedValue(createUser());
    harness.passwordResetService.request.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      harness.service.forgotPassword('user@example.com', CONTEXT),
    ).resolves.toBeUndefined();

    expect(harness.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'AUTH_PASSWORD_RESET_REQUESTED' }),
      'Password reset delivery failed',
    );
  });

  it('treats unknown, disabled and existing accounts uniformly', async () => {
    harness.passwordResetService.request.mockResolvedValue(undefined);

    harness.users.findByEmail.mockResolvedValueOnce(null);
    await expect(
      harness.service.forgotPassword('unknown@example.com', CONTEXT),
    ).resolves.toBeUndefined();

    harness.users.findByEmail.mockResolvedValueOnce(createUser({ isActive: false }));
    await expect(
      harness.service.forgotPassword('disabled@example.com', CONTEXT),
    ).resolves.toBeUndefined();

    harness.users.findByEmail.mockResolvedValueOnce(createUser());
    await expect(
      harness.service.forgotPassword('user@example.com', CONTEXT),
    ).resolves.toBeUndefined();
  });

  it('applies a minimum duration to active, unknown and disabled forgot paths', async () => {
    harness = createHarness({ forgotTimingFloorMs: 30 });
    harness.passwordResetService.request.mockResolvedValue(undefined);

    harness.users.findByEmail.mockResolvedValueOnce(null);
    let startedAt = Date.now();
    await harness.service.forgotPassword('unknown@example.com', CONTEXT);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);

    harness.users.findByEmail.mockResolvedValueOnce(createUser({ isActive: false }));
    startedAt = Date.now();
    await harness.service.forgotPassword('disabled@example.com', CONTEXT);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);

    harness.users.findByEmail.mockResolvedValueOnce(createUser());
    startedAt = Date.now();
    await harness.service.forgotPassword('user@example.com', CONTEXT);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);

    await harness.service.flushBackgroundAudits();
  });

  it('rate-limits reset attempts by IP before consuming the token', async () => {
    harness.rateLimiter.consume.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 90,
    });

    await expect(
      harness.service.resetPassword('raw-token', 'a-new-strong-password', CONTEXT),
    ).rejects.toMatchObject({ code: 'AUTH_RATE_LIMITED', statusCode: 429 });

    expect(harness.rateLimiter.consume).toHaveBeenCalledWith(
      'reset-ip',
      [CONTEXT.ipAddress],
      5,
      3_600,
    );
    expect(harness.passwordResetService.reset).not.toHaveBeenCalled();
  });

  it('consumes the reset token after the IP limiter allows the request', async () => {
    harness.passwordResetService.reset.mockResolvedValue({
      userId: USER_ID,
      resetTokenId: 'reset-token-id',
    });
    harness.organizations.listActiveMemberships.mockResolvedValue([membership()]);

    await harness.service.resetPassword('raw-token', 'a-new-strong-password', CONTEXT);

    expect(harness.passwordResetService.reset).toHaveBeenCalledWith(
      'raw-token',
      'a-new-strong-password',
    );
  });
});
