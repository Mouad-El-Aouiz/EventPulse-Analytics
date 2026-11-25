import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext, AuthContext } from '../../src/shared/types/actor-context.js';
import { PrismaAuthUnitOfWork } from '../../src/modules/auth/repositories/auth-unit-of-work.js';
import { PasswordResetTokenRepository } from '../../src/modules/auth/repositories/password-reset-token.repository.js';
import { SessionRepository } from '../../src/modules/auth/repositories/session.repository.js';
import { UserRepository } from '../../src/modules/auth/repositories/user.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { PasswordResetService } from '../../src/modules/auth/services/password-reset.service.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { hashTokenWithPepper } from '../../src/modules/auth/services/token-hash.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { PrismaAuditWriter } from '../../src/modules/audit/audit.writer.js';
import { PrismaOrganizationsReader } from '../../src/modules/organizations/organizations-reader.js';
import type { MailPort, PasswordResetMail } from '../../src/shared/ports/mail.port.js';
import { InMemoryRateLimitStore } from '../../src/shared/rate-limit/in-memory-rate-limit.store.js';
import { RateLimiter } from '../../src/shared/rate-limit/rate-limiter.js';
import { createTestClient } from './helpers/database.js';
import {
  createMembership,
  createOrganization,
  createUser,
  uniqueEmail,
} from './helpers/factories.js';

const client = createTestClient();
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'an-even-stronger-password';
const REFRESH_PEPPER = 'integration-refresh-pepper-at-least-32-chars';
const RESET_PEPPER = 'integration-reset-pepper-at-least-32-chars';
const CONTEXT = { ipAddress: '203.0.113.10', userAgent: 'vitest-integration' };

const passwords = new PasswordService();
const tokens = new TokenService({
  secret: 'integration-jwt-secret-at-least-32-characters',
  issuer: 'eventpulse-analytics',
  audience: 'eventpulse-api',
  keyId: 'integration',
  accessTtlSeconds: 900,
});

let passwordHash: string;

class RecordingMail implements MailPort {
  readonly messages: PasswordResetMail[] = [];

  async assertAvailable(): Promise<void> {}

  async sendPasswordReset(input: PasswordResetMail): Promise<void> {
    this.messages.push(input);
  }
}

function createHarness() {
  const mail = new RecordingMail();
  const rateLimiter = new RateLimiter({
    store: new InMemoryRateLimitStore(),
    keyPrefix: `test-${randomUUID()}`,
    pepper: 'rate-limit-pepper',
    failClosed: true,
  });

  const users = new UserRepository(client);
  const sessions = new SessionRepository(client);
  const resetTokens = new PasswordResetTokenRepository(client);
  const organizations = new PrismaOrganizationsReader(client);
  const audit = new PrismaAuditWriter(client);
  const unitOfWork = new PrismaAuthUnitOfWork(client);

  const sessionService = new SessionService({
    sessions,
    tokens,
    unitOfWork,
    clock: { now: () => new Date() },
    refreshPepper: REFRESH_PEPPER,
    slidingTtlSeconds: 7 * 24 * 60 * 60,
    absoluteTtlSeconds: 30 * 24 * 60 * 60,
  });

  const passwordResetService = new PasswordResetService({
    users,
    resetTokens,
    sessions,
    passwords,
    mail,
    unitOfWork,
    tokens,
    clock: { now: () => new Date() },
    resetPepper: RESET_PEPPER,
    resetTtlSeconds: 1800,
  });

  const service = new AuthService({
    users,
    sessions,
    organizations,
    audit,
    passwords,
    tokens,
    sessionService,
    passwordResetService,
    rateLimiter,
    clock: { now: () => new Date() },
    logger: {
      warn: () => undefined,
      error: () => undefined,
      info: () => undefined,
    } as never,
    refreshPepper: REFRESH_PEPPER,
    resetPepper: RESET_PEPPER,
    loginLimit: { maxAttempts: 10, windowSeconds: 900 },
    forgotLimit: { maxAttempts: 5, windowSeconds: 3600 },
    refreshLimit: { maxAttempts: 60, windowSeconds: 3600 },
    lockout: { threshold: 5, baseSeconds: 60, maxSeconds: 86_400 },
    forgotTimingFloorMs: 0,
  });

  return { service, mail, sessions, resetTokens };
}

async function createAccount(
  options: { isActive?: boolean; role?: 'OWNER' | 'ADMIN' | 'VIEWER' } = {},
) {
  const organization = await createOrganization(client);
  const user = await createUser(client, { email: uniqueEmail('auth') });
  const membership = await createMembership(client, organization.id, user.id, options.role);

  await client.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      isActive: options.isActive ?? true,
    },
  });

  return { organization, user, membership };
}

function loginInput(email: string, overrides: Record<string, unknown> = {}) {
  return { email, password: PASSWORD, ...CONTEXT, ...overrides };
}

function actorFor(auth: AuthContext, membershipId: string): ActorContext {
  return {
    ...auth,
    membershipId,
    role: auth.roleHint,
  };
}

beforeAll(async () => {
  passwordHash = await passwords.hash(PASSWORD);
});

afterAll(async () => {
  await client.$disconnect();
});

describe('Auth PostgreSQL integration', () => {
  it('persists a hashed session, updates last login and audits a successful login', async () => {
    const { organization, user } = await createAccount();
    const { service } = createHarness();

    const result = await service.login(loginInput(user.email));

    const payload = await tokens.verifyAccessToken(result.body.accessToken);
    const stored = await client.session.findMany({ where: { userId: user.id } });

    expect(stored).toHaveLength(1);
    expect(stored[0]?.refreshTokenHash).toBe(
      hashTokenWithPepper(result.refreshToken, REFRESH_PEPPER),
    );
    expect(stored[0]?.refreshTokenHash).not.toBe(result.refreshToken);
    expect(stored[0]?.organizationId).toBe(organization.id);
    expect(stored[0]?.familyId).toMatch(/^[0-9a-f-]{36}$/);

    const absoluteLifetime = stored[0]!.absoluteExpiresAt.getTime() - Date.now();
    const slidingLifetime = stored[0]!.expiresAt.getTime() - Date.now();

    expect(absoluteLifetime).toBeGreaterThan(29 * 86_400_000);
    expect(absoluteLifetime).toBeLessThanOrEqual(30 * 86_400_000);
    expect(slidingLifetime).toBeGreaterThan(6 * 86_400_000);
    expect(slidingLifetime).toBeLessThanOrEqual(7 * 86_400_000);

    expect(payload).toMatchObject({
      userId: user.id,
      sessionId: stored[0]?.id,
      organizationId: organization.id,
      roleHint: 'OWNER',
    });

    const refreshedUser = await client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshedUser.lastLoginAt).not.toBeNull();

    const audit = await client.auditLog.findFirst({
      where: { actorUserId: user.id, actionType: 'AUTH_LOGIN_SUCCEEDED' },
    });
    expect(audit).toMatchObject({ organizationId: organization.id, result: 'SUCCESS' });
  });

  it('requires an explicit organization when the user has several memberships', async () => {
    const first = await createAccount();
    const secondOrganization = await createOrganization(client);
    await createMembership(client, secondOrganization.id, first.user.id, 'VIEWER');

    const { service } = createHarness();

    await expect(service.login(loginInput(first.user.email))).rejects.toMatchObject({
      code: 'AUTH_ORGANIZATION_REQUIRED',
      statusCode: 409,
    });
    expect(await client.session.count({ where: { userId: first.user.id } })).toBe(0);

    const selected = await service.login(
      loginInput(first.user.email, { organizationId: secondOrganization.id }),
    );

    expect(selected.body.activeOrganization.id).toBe(secondOrganization.id);
    expect(selected.body.activeOrganization.role).toBe('VIEWER');
  });

  it('verifies the password before rejecting a disabled account', async () => {
    const { user } = await createAccount({ isActive: false });
    const { service } = createHarness();

    await expect(
      service.login(loginInput(user.email, { password: 'wrong-password' })),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', statusCode: 401 });

    await expect(service.login(loginInput(user.email))).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_DISABLED',
      statusCode: 403,
    });
    expect(await client.session.count({ where: { userId: user.id } })).toBe(0);

    const audit = await client.auditLog.findFirst({
      where: { actorUserId: user.id, actionType: 'AUTH_LOGIN_FAILED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ reason: 'ACCOUNT_DISABLED' });
  });

  it('scopes progressive lockout to the attacking IP without locking out the victim', async () => {
    const { user } = await createAccount();
    const { service } = createHarness();
    const attackerIp = '198.51.100.10';
    const victimIp = '203.0.113.20';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login(
          loginInput(user.email, { ipAddress: attackerIp, password: 'wrong-password' }),
        ),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    }

    await expect(
      service.login(loginInput(user.email, { ipAddress: attackerIp })),
    ).rejects.toMatchObject({ code: 'AUTH_RATE_LIMITED' });

    const victimLogin = await service.login(loginInput(user.email, { ipAddress: victimIp }));
    expect(victimLogin.refreshToken).toBeDefined();

    await expect(
      service.login(loginInput(user.email, { ipAddress: attackerIp })),
    ).rejects.toMatchObject({ code: 'AUTH_RATE_LIMITED' });

    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
    await service.flushBackgroundAudits();
  });

  it('revokes the family when a persisted session has no organization', async () => {
    const { user } = await createAccount();
    const { service } = createHarness();

    const login = await service.login(loginInput(user.email));
    const session = await client.session.findFirstOrThrow({ where: { userId: user.id } });

    await client.session.update({
      where: { id: session.id },
      data: { organizationId: null },
    });

    await expect(service.refresh(login.refreshToken, CONTEXT)).rejects.toMatchObject({
      code: 'AUTH_NO_ACTIVE_MEMBERSHIP',
    });

    const family = await client.session.findMany({ where: { familyId: session.familyId } });
    expect(family.length).toBeGreaterThan(0);
    expect(family.every((candidate) => candidate.revokedAt !== null)).toBe(true);
  });

  it('rotates refresh tokens atomically and revokes the family on reuse', async () => {
    const { user } = await createAccount();
    const { service } = createHarness();

    const login = await service.login(loginInput(user.email));
    const firstSession = await client.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });

    const refreshed = await service.refresh(login.refreshToken, CONTEXT);
    const oldSession = await client.session.findUniqueOrThrow({
      where: { id: firstSession.id },
    });
    const newSession = await client.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(oldSession.revokedAt).not.toBeNull();
    expect(oldSession.replacedBySessionId).toBe(newSession.id);
    expect(newSession.familyId).toBe(oldSession.familyId);
    expect(newSession.absoluteExpiresAt).toEqual(oldSession.absoluteExpiresAt);

    await expect(service.refresh(login.refreshToken, CONTEXT)).rejects.toMatchObject({
      code: 'AUTH_SESSION_REVOKED',
    });

    const family = await client.session.findMany({
      where: { familyId: oldSession.familyId },
    });
    expect(family.length).toBeGreaterThanOrEqual(2);
    expect(family.every((session) => session.revokedAt !== null)).toBe(true);

    const reuseAudit = await client.auditLog.findFirst({
      where: { actorUserId: user.id, actionType: 'AUTH_REFRESH_REUSE_DETECTED' },
    });
    expect(reuseAudit?.result).toBe('FAILURE');
  });

  it('allows only one of two concurrent refresh rotations and revokes the family', async () => {
    const { user } = await createAccount();
    const { service } = createHarness();

    const login = await service.login(loginInput(user.email));
    const results = await Promise.allSettled([
      service.refresh(login.refreshToken, CONTEXT),
      service.refresh(login.refreshToken, CONTEXT),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const fulfilled = results.find((result) => result.status === 'fulfilled');
    const rejected = results.find((result) => result.status === 'rejected');

    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'AUTH_SESSION_REVOKED' }),
    });

    const active = await client.session.count({
      where: {
        userId: user.id,
        revokedAt: null,
        familyId: (await client.session.findFirstOrThrow({ where: { userId: user.id } })).familyId,
      },
    });
    expect(active).toBe(0);

    if (fulfilled?.status === 'fulfilled') {
      await expect(service.refresh(fulfilled.value.refreshToken, CONTEXT)).rejects.toMatchObject({
        code: 'AUTH_SESSION_REVOKED',
      });
    }
  });

  it('revokes every session on logout-all', async () => {
    const { user, membership } = await createAccount();
    const { service } = createHarness();

    const first = await service.login(loginInput(user.email));
    await service.login(loginInput(user.email));

    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(2);

    const auth = await tokens.verifyAccessToken(first.body.accessToken);
    await service.logoutAll(actorFor(auth, membership.id), CONTEXT);

    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });

  it('keeps only 20 active sessions after exceeding the cap well past 50 rows', async () => {
    const { organization, user } = await createAccount();
    const { service } = createHarness();

    await service.login(loginInput(user.email));

    const base = Date.now() - 60_000;
    await client.session.createMany({
      data: Array.from({ length: 54 }, (_, index) => ({
        userId: user.id,
        organizationId: organization.id,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        absoluteExpiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(base + index),
      })),
    });

    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(55);

    await service.login(loginInput(user.email));

    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(20);
    expect(await client.session.count({ where: { userId: user.id } })).toBe(56);
  });

  it('keeps a single active password-reset token under concurrent requests', async () => {
    const { user } = await createAccount();
    const { service } = createHarness();

    await Promise.all([
      service.forgotPassword(user.email, CONTEXT),
      service.forgotPassword(user.email, CONTEXT),
    ]);

    expect(
      await client.passwordResetToken.count({ where: { userId: user.id, usedAt: null } }),
    ).toBe(1);

    await service.flushBackgroundAudits();
  });

  it('does not invalidate the latest token when the per-account reset quota rejects a request', async () => {
    const { user } = await createAccount();
    const { service, mail, resetTokens } = createHarness();
    const acceptedIps = [
      '203.0.113.31',
      '203.0.113.32',
      '203.0.113.33',
      '203.0.113.34',
      '203.0.113.35',
    ];

    for (const ipAddress of acceptedIps) {
      await service.forgotPassword(user.email, { ...CONTEXT, ipAddress });
    }

    expect(mail.messages).toHaveLength(5);
    const latestToken = mail.messages.at(-1)?.resetToken ?? '';
    const latestHash = hashTokenWithPepper(latestToken, RESET_PEPPER);
    expect((await resetTokens.findByHash(latestHash))?.usedAt).toBeNull();

    await expect(
      service.forgotPassword(user.email, { ...CONTEXT, ipAddress: '203.0.113.36' }),
    ).resolves.toBeUndefined();

    expect(mail.messages).toHaveLength(5);
    expect((await resetTokens.findByHash(latestHash))?.usedAt).toBeNull();
    expect(
      await client.passwordResetToken.count({ where: { userId: user.id, usedAt: null } }),
    ).toBe(1);

    await service.resetPassword(latestToken, NEW_PASSWORD, {
      ...CONTEXT,
      ipAddress: '203.0.113.37',
    });

    const updated = await client.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(passwords.verify(updated.passwordHash, NEW_PASSWORD)).resolves.toBe(true);
    await service.flushBackgroundAudits();
  });

  it('returns the same outcome for an unknown account without sending mail', async () => {
    const { service, mail } = createHarness();

    await expect(service.forgotPassword(uniqueEmail('missing'), CONTEXT)).resolves.toBeUndefined();

    expect(mail.messages).toHaveLength(0);
  });

  it('rotates the session when switching organization', async () => {
    const first = await createAccount();
    const secondOrganization = await createOrganization(client);
    await createMembership(client, secondOrganization.id, first.user.id, 'ADMIN');

    const { service } = createHarness();
    const login = await service.login(
      loginInput(first.user.email, { organizationId: first.organization.id }),
    );
    const auth = await tokens.verifyAccessToken(login.body.accessToken);
    const actor = actorFor(auth, first.membership.id);

    const switched = await service.switchOrganization(actor, secondOrganization.id, CONTEXT);
    const sessions = await client.session.findMany({
      where: { userId: first.user.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(switched.body.activeOrganization.id).toBe(secondOrganization.id);
    expect(switched.body.activeOrganization.role).toBe('ADMIN');
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.revokedAt).not.toBeNull();
    expect(sessions[1]?.organizationId).toBe(secondOrganization.id);
    expect(sessions[1]?.familyId).toBe(sessions[0]?.familyId);

    const switchedPayload = await tokens.verifyAccessToken(switched.body.accessToken);
    expect(switchedPayload.organizationId).toBe(secondOrganization.id);
  });

  it('enforces the absolute session deadline and forbids a sliding window beyond it', async () => {
    const { user } = await createAccount();
    const { service } = createHarness();

    const login = await service.login(loginInput(user.email));
    const session = await client.session.findFirstOrThrow({ where: { userId: user.id } });
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 86_400_000);

    await expect(
      client.session.update({
        where: { id: session.id },
        data: { absoluteExpiresAt: past, expiresAt: future },
      }),
    ).rejects.toThrow();

    await client.session.update({
      where: { id: session.id },
      data: { absoluteExpiresAt: past, expiresAt: past },
    });

    await expect(service.refresh(login.refreshToken, CONTEXT)).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
    });

    const revoked = await client.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('accepts only one simultaneous reset for the same token', async () => {
    const { user } = await createAccount();
    const { service, mail } = createHarness();

    await service.forgotPassword(user.email, CONTEXT);
    const token = mail.messages.at(-1)?.resetToken ?? '';

    const results = await Promise.allSettled([
      service.resetPassword(token, 'simultaneous-password-one', CONTEXT),
      service.resetPassword(token, 'simultaneous-password-two', CONTEXT),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const updated = await client.user.findUniqueOrThrow({ where: { id: user.id } });
    const matches = await Promise.all([
      passwords.verify(updated.passwordHash, 'simultaneous-password-one'),
      passwords.verify(updated.passwordHash, 'simultaneous-password-two'),
    ]);

    expect(matches.filter(Boolean)).toHaveLength(1);

    await service.flushBackgroundAudits();
  });

  it('stores only a hash of password-reset tokens and makes each token single-use', async () => {
    const { user } = await createAccount();
    const { service, mail, resetTokens } = createHarness();

    const login = await service.login(loginInput(user.email));

    await service.forgotPassword(user.email, CONTEXT);

    const message = mail.messages.at(-1);
    expect(message?.to).toBe(user.email);
    expect(message?.resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const firstToken = message?.resetToken ?? '';
    const stored = await resetTokens.findByHash(hashTokenWithPepper(firstToken, RESET_PEPPER));
    expect(stored?.usedAt).toBeNull();
    expect(stored?.userId).toBe(user.id);
    expect(stored?.tokenHash).not.toBe(firstToken);

    await service.forgotPassword(user.email, CONTEXT);

    const firstStored = await client.passwordResetToken.findUniqueOrThrow({
      where: { id: stored?.id ?? '' },
    });
    expect(firstStored.usedAt).not.toBeNull();

    const latestToken = mail.messages.at(-1)?.resetToken ?? '';
    const latestStored = await resetTokens.findByHash(
      hashTokenWithPepper(latestToken, RESET_PEPPER),
    );

    await service.resetPassword(latestToken, NEW_PASSWORD, CONTEXT);

    const updatedUser = await client.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(passwords.verify(updatedUser.passwordHash, NEW_PASSWORD)).resolves.toBe(true);
    await expect(passwords.verify(updatedUser.passwordHash, PASSWORD)).resolves.toBe(false);

    expect(await client.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(login.refreshToken).toBeDefined();

    const consumed = await client.passwordResetToken.findUniqueOrThrow({
      where: { id: latestStored?.id ?? '' },
    });
    expect(consumed.usedAt).not.toBeNull();

    await expect(
      service.resetPassword(latestToken, 'third-fallback-password', CONTEXT),
    ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID' });
  });
});
