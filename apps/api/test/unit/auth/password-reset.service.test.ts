import type { PasswordResetToken } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_RESET_TOKEN_INVALID } from '../../../src/modules/auth/auth.errors.js';
import type { PrismaAuthUnitOfWork } from '../../../src/modules/auth/repositories/auth-unit-of-work.js';
import type { PasswordResetTokenRepository } from '../../../src/modules/auth/repositories/password-reset-token.repository.js';
import type { SessionRepository } from '../../../src/modules/auth/repositories/session.repository.js';
import type { UserRepository } from '../../../src/modules/auth/repositories/user.repository.js';
import type { PasswordService } from '../../../src/modules/auth/services/password.service.js';
import { PasswordResetService } from '../../../src/modules/auth/services/password-reset.service.js';
import { hashTokenWithPepper } from '../../../src/modules/auth/services/token-hash.js';
import { TokenService } from '../../../src/modules/auth/services/token.service.js';
import type { MailPort } from '../../../src/shared/ports/mail.port.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'user@example.com';
const RESET_PEPPER = 'reset-pepper';

const tokens = new TokenService({
  secret: 'test-jwt-secret-with-more-than-32-characters',
  issuer: 'eventpulse-analytics',
  audience: 'eventpulse-api',
  keyId: 'primary',
  accessTtlSeconds: 900,
});

function createToken(overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    userId: USER_ID,
    tokenHash: 'hash',
    expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    usedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function createHarness() {
  const resetTokens = {
    create: vi.fn(),
    findByHash: vi.fn(),
    invalidateUnusedForUser: vi.fn().mockResolvedValue(1),
    consume: vi.fn().mockResolvedValue(1),
  };
  const users = { updatePassword: vi.fn(), lockById: vi.fn() };
  const sessions = { revokeAllForUser: vi.fn() };
  const mail = {
    assertAvailable: vi.fn(),
    sendPasswordReset: vi.fn(),
  };
  const unitOfWork = {
    run: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({ tx: true })),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('new-password-hash'),
  };
  const service = new PasswordResetService({
    users: users as unknown as UserRepository,
    resetTokens: resetTokens as unknown as PasswordResetTokenRepository,
    sessions: sessions as unknown as SessionRepository,
    passwords: passwords as unknown as PasswordService,
    mail: mail as unknown as MailPort,
    unitOfWork: unitOfWork as unknown as PrismaAuthUnitOfWork,
    tokens,
    clock: { now: () => NOW },
    resetPepper: RESET_PEPPER,
    resetTtlSeconds: 1800,
  });

  return { service, resetTokens, users, sessions, mail, unitOfWork, passwords };
}

describe('PasswordResetService', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('invalidates previous tokens before creating and mailing a new hashed token', async () => {
    await harness.service.request(USER_ID, EMAIL);

    expect(harness.mail.assertAvailable).toHaveBeenCalledTimes(1);
    expect(harness.users.lockById).toHaveBeenCalledWith(USER_ID, { tx: true });
    expect(harness.resetTokens.invalidateUnusedForUser).toHaveBeenCalledWith(USER_ID, NOW, {
      tx: true,
    });

    const created = harness.resetTokens.create.mock.calls[0]?.[0];
    const mailed = harness.mail.sendPasswordReset.mock.calls[0]?.[0];

    expect(created).toMatchObject({
      userId: USER_ID,
      expiresAt: new Date(NOW.getTime() + 1800 * 1000),
    });
    expect(mailed).toEqual({
      to: EMAIL,
      resetToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresAt: created?.expiresAt,
    });
    expect(harness.resetTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
      { tx: true },
    );
    expect(created?.tokenHash).toBe(hashTokenWithPepper(mailed?.resetToken ?? '', RESET_PEPPER));
    expect(created?.tokenHash).not.toBe(mailed?.resetToken);

    const invalidateOrder = harness.resetTokens.invalidateUnusedForUser.mock.invocationCallOrder[0];
    const createOrder = harness.resetTokens.create.mock.invocationCallOrder[0];

    expect(invalidateOrder).toBeLessThan(createOrder ?? Number.POSITIVE_INFINITY);
  });

  it('refuses to prepare a reset when mail delivery is not configured', async () => {
    harness.mail.assertAvailable.mockRejectedValueOnce(new Error('mail unavailable'));

    await expect(harness.service.request(USER_ID, EMAIL)).rejects.toThrow('mail unavailable');
    expect(harness.resetTokens.create).not.toHaveBeenCalled();
  });

  it('rejects used, expired and unknown reset tokens', async () => {
    harness.resetTokens.findByHash.mockResolvedValueOnce(createToken({ usedAt: NOW }));
    await expect(harness.service.findValidToken('token')).resolves.toBeNull();

    harness.resetTokens.findByHash.mockResolvedValueOnce(
      createToken({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(harness.service.findValidToken('token')).resolves.toBeNull();

    harness.resetTokens.findByHash.mockResolvedValueOnce(null);
    await expect(harness.service.findValidToken('token')).resolves.toBeNull();
  });

  it('looks tokens up by hash, never by raw value', async () => {
    harness.resetTokens.findByHash.mockResolvedValueOnce(createToken());

    await harness.service.findValidToken('raw-token');

    expect(harness.resetTokens.findByHash).toHaveBeenCalledWith(
      hashTokenWithPepper('raw-token', RESET_PEPPER),
    );
  });

  it('consumes the token, updates the password, revokes sessions and invalidates siblings in one unit of work', async () => {
    harness.resetTokens.findByHash.mockResolvedValueOnce(createToken());

    await expect(harness.service.reset('raw-token', 'a-new-strong-password')).resolves.toEqual({
      userId: USER_ID,
      resetTokenId: '66666666-6666-4666-8666-666666666666',
    });

    expect(harness.passwords.hash).toHaveBeenCalledWith('a-new-strong-password');
    expect(harness.unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(harness.resetTokens.consume).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      NOW,
      { tx: true },
    );
    expect(harness.users.updatePassword).toHaveBeenCalledWith(USER_ID, 'new-password-hash', {
      tx: true,
    });
    expect(harness.sessions.revokeAllForUser).toHaveBeenCalledWith(USER_ID, NOW, { tx: true });
    expect(harness.resetTokens.invalidateUnusedForUser).toHaveBeenLastCalledWith(USER_ID, NOW, {
      tx: true,
    });
  });

  it('rejects an invalid token before touching the password', async () => {
    harness.resetTokens.findByHash.mockResolvedValueOnce(null);

    await expect(harness.service.reset('raw-token', 'a-new-strong-password')).rejects.toMatchObject(
      { code: AUTH_RESET_TOKEN_INVALID, statusCode: 400 },
    );
    expect(harness.passwords.hash).not.toHaveBeenCalled();
    expect(harness.unitOfWork.run).not.toHaveBeenCalled();
  });

  it('rejects concurrent consumption of the same token', async () => {
    harness.resetTokens.findByHash.mockResolvedValueOnce(createToken());
    harness.resetTokens.consume.mockResolvedValueOnce(0);

    await expect(harness.service.reset('raw-token', 'a-new-strong-password')).rejects.toMatchObject(
      { code: AUTH_RESET_TOKEN_INVALID },
    );
    expect(harness.users.updatePassword).not.toHaveBeenCalled();
    expect(harness.sessions.revokeAllForUser).not.toHaveBeenCalled();
  });
});
