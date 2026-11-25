import type { Session } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRepository } from '../../../src/modules/auth/repositories/session.repository.js';
import {
  MAX_ACTIVE_SESSIONS_PER_USER,
  SessionService,
} from '../../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../../src/modules/auth/services/token.service.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '33333333-3333-4333-8333-333333333333';

const tokens = new TokenService({
  secret: 'test-jwt-secret-with-more-than-32-characters',
  issuer: 'eventpulse-analytics',
  audience: 'eventpulse-api',
  keyId: 'primary',
  accessTtlSeconds: 900,
});

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: USER_ID,
    organizationId: ORG_ID,
    familyId: '55555555-5555-4555-8555-555555555555',
    refreshTokenHash: 'hash',
    expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
    absoluteExpiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
    revokedAt: null,
    replacedBySessionId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: NOW,
    lastUsedAt: null,
    ...overrides,
  };
}

function createRepositoryMock() {
  return {
    create: vi.fn(),
    lockUser: vi.fn(),
    revokeExcessActiveForUser: vi.fn().mockResolvedValue(0),
    claimRotation: vi.fn(),
    findById: vi.fn(),
    setReplacement: vi.fn(),
    revokeCurrent: vi.fn(),
  };
}

function createUnitOfWorkMock() {
  return {
    run: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({ tx: true })),
  };
}

function createService(
  repository: ReturnType<typeof createRepositoryMock>,
  slidingTtlSeconds = 7 * 24 * 60 * 60,
  absoluteTtlSeconds = 30 * 24 * 60 * 60,
): SessionService {
  return new SessionService({
    sessions: repository as unknown as SessionRepository,
    tokens,
    unitOfWork: createUnitOfWorkMock() as never,
    clock: { now: () => NOW },
    refreshPepper: 'refresh-pepper',
    slidingTtlSeconds,
    absoluteTtlSeconds,
  });
}

describe('SessionService', () => {
  let repository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    repository = createRepositoryMock();
    repository.create.mockImplementation(async (input: { refreshTokenHash: string }) =>
      createSession({ refreshTokenHash: input.refreshTokenHash }),
    );
  });

  it('creates a session with a hashed refresh token, sliding expiry and absolute cap', async () => {
    const service = createService(repository);

    const issued = await service.create({
      userId: USER_ID,
      organizationId: ORG_ID,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(issued.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.session.refreshTokenHash).not.toBe(issued.refreshToken);

    const created = repository.create.mock.calls[0]?.[0];

    expect(created).toMatchObject({
      userId: USER_ID,
      organizationId: ORG_ID,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
      absoluteExpiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
    });
    expect(created?.refreshTokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created?.familyId).not.toBe(created?.refreshTokenHash);
  });

  it('caps expiry at the absolute deadline when sliding is longer', async () => {
    const service = createService(repository, 40 * 24 * 60 * 60, 30 * 24 * 60 * 60);

    await service.create({
      userId: USER_ID,
      organizationId: ORG_ID,
      ipAddress: null,
      userAgent: null,
    });

    const created = repository.create.mock.calls[0]?.[0];
    const absolute = new Date(NOW.getTime() + 30 * DAY_MS);

    expect(created?.expiresAt).toEqual(absolute);
    expect(created?.absoluteExpiresAt).toEqual(absolute);
  });

  it('locks the user and revokes every session beyond the per-user cap before creating a new one', async () => {
    const service = createService(repository);

    await service.create({
      userId: USER_ID,
      organizationId: ORG_ID,
      ipAddress: null,
      userAgent: null,
    });

    expect(repository.lockUser).toHaveBeenCalledWith(USER_ID, { tx: true });
    expect(repository.revokeExcessActiveForUser).toHaveBeenCalledWith(
      USER_ID,
      MAX_ACTIVE_SESSIONS_PER_USER - 1,
      NOW,
      { tx: true },
    );
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('detects expiration on either sliding or absolute deadline', () => {
    const service = createService(repository);

    expect(service.isExpired(createSession(), NOW)).toBe(false);
    expect(service.isExpired(createSession({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(
      true,
    );
    expect(
      service.isExpired(
        createSession({
          expiresAt: new Date(NOW.getTime() + DAY_MS),
          absoluteExpiresAt: new Date(NOW.getTime() - 1),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it('rotates a session atomically while preserving family and absolute expiry', async () => {
    const service = createService(repository);
    const current = createSession();
    repository.claimRotation.mockResolvedValue(1);
    repository.create.mockImplementation(async (input: { refreshTokenHash: string }) =>
      createSession({
        id: 'new-session',
        familyId: current.familyId,
        refreshTokenHash: input.refreshTokenHash,
      }),
    );

    const result = await service.rotate({
      session: current,
      organizationId: ORG_ID,
      ipAddress: '10.0.0.1',
      userAgent: 'vitest',
    });

    expect(result.status).toBe('rotated');
    expect(repository.claimRotation).toHaveBeenCalledWith(
      current.id,
      current.refreshTokenHash,
      NOW,
      { tx: true },
    );

    const created = repository.create.mock.calls[0]?.[0];

    expect(created).toMatchObject({
      familyId: current.familyId,
      absoluteExpiresAt: current.absoluteExpiresAt,
    });
    expect(repository.setReplacement).toHaveBeenCalledWith(current.id, 'new-session', {
      tx: true,
    });
  });

  it('does not record a replacement when creating the rotated session fails', async () => {
    const service = createService(repository);
    repository.claimRotation.mockResolvedValue(1);
    repository.create.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      service.rotate({
        session: createSession(),
        organizationId: ORG_ID,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toThrow('insert failed');

    expect(repository.setReplacement).not.toHaveBeenCalled();
  });

  it('propagates replacement failures so the transaction rolls back', async () => {
    const service = createService(repository);
    repository.claimRotation.mockResolvedValue(1);
    repository.setReplacement.mockRejectedValueOnce(new Error('replacement failed'));

    await expect(
      service.rotate({
        session: createSession(),
        organizationId: ORG_ID,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toThrow('replacement failed');
  });

  it('reports reuse when the presented refresh token was already rotated', async () => {
    const service = createService(repository);
    const revoked = createSession({ revokedAt: NOW });
    repository.claimRotation.mockResolvedValue(0);
    repository.findById.mockResolvedValue(revoked);

    await expect(
      service.rotate({
        session: revoked,
        organizationId: ORG_ID,
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ status: 'reuse', session: revoked });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reports invalid when the session cannot be claimed and no longer exists', async () => {
    const service = createService(repository);
    repository.claimRotation.mockResolvedValue(0);
    repository.findById.mockResolvedValue(null);

    await expect(
      service.rotate({
        session: createSession(),
        organizationId: ORG_ID,
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toEqual({ status: 'invalid' });
  });
});
