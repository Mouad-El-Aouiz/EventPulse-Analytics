import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  createAuthenticateMiddleware,
  createOptionalAuthenticateMiddleware,
} from '../../../src/modules/auth/middleware/authenticate.middleware.js';
import type { SessionRepository } from '../../../src/modules/auth/repositories/session.repository.js';
import type { UserRepository } from '../../../src/modules/auth/repositories/user.repository.js';
import type { TokenService } from '../../../src/modules/auth/services/token.service.js';
import type { Clock } from '../../../src/shared/ports/clock.port.js';
import type { AuthContext } from '../../../src/shared/types/actor-context.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const CONTEXT: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  roleHint: 'OWNER',
  tokenId: '44444444-4444-4444-8444-444444444444',
};

function createRequest(): Request {
  return {
    get: vi.fn().mockReturnValue('Bearer access-token'),
  } as unknown as Request;
}

function createDependencies() {
  const tokens = { verifyAccessToken: vi.fn().mockResolvedValue(CONTEXT) };
  const sessions = {
    findById: vi.fn().mockResolvedValue({
      id: CONTEXT.sessionId,
      userId: CONTEXT.userId,
      organizationId: null,
      revokedAt: null,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      absoluteExpiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
    }),
  };
  const users = { findById: vi.fn() };

  return {
    tokens,
    sessions,
    users,
    dependencies: {
      tokens: tokens as unknown as TokenService,
      sessions: sessions as unknown as SessionRepository,
      users: users as unknown as UserRepository,
      clock: { now: () => NOW } as Clock,
    },
  };
}

describe.each([
  ['required', createAuthenticateMiddleware],
  ['optional', createOptionalAuthenticateMiddleware],
] as const)('%s authentication with a null-organization session', (_name, factory) => {
  it('rejects the bearer token before building an actor context', async () => {
    const { dependencies, users } = createDependencies();
    const middleware = factory(dependencies);
    const request = createRequest();
    const next = vi.fn();

    await middleware(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_TOKEN_INVALID', statusCode: 401 }),
    );
    expect(request.auth).toBeUndefined();
    expect(users.findById).not.toHaveBeenCalled();
  });
});

interface SessionOverrides {
  id?: string;
  userId?: string;
  organizationId?: string | null;
  revokedAt?: Date | null;
  expiresAt?: Date;
  absoluteExpiresAt?: Date;
}

function requestWith(authorization: string | undefined): Request {
  return { get: vi.fn().mockReturnValue(authorization) } as unknown as Request;
}

function statefulDependencies(
  options: {
    session?: SessionOverrides | null;
    user?: { isActive: boolean } | null;
    verify?: () => Promise<AuthContext>;
  } = {},
) {
  const tokens = {
    verifyAccessToken: vi.fn(options.verify ?? (async () => CONTEXT)),
  };
  const sessions = {
    findById: vi.fn(async () =>
      options.session === null
        ? null
        : {
            id: CONTEXT.sessionId,
            userId: CONTEXT.userId,
            organizationId: CONTEXT.organizationId,
            revokedAt: null,
            expiresAt: new Date(NOW.getTime() + 86_400_000),
            absoluteExpiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
            ...(options.session ?? {}),
          },
    ),
  };
  const users = {
    findById: vi.fn(async () => (options.user === undefined ? { isActive: true } : options.user)),
  };

  return {
    tokens,
    sessions,
    users,
    dependencies: {
      tokens: tokens as unknown as TokenService,
      sessions: sessions as unknown as SessionRepository,
      users: users as unknown as UserRepository,
      clock: { now: () => NOW } as Clock,
    },
  };
}

function expectedError(next: ReturnType<typeof vi.fn>): unknown {
  expect(next).toHaveBeenCalledTimes(1);

  return next.mock.calls[0]?.[0];
}

describe('required authentication matrix', () => {
  it('rejects a missing Authorization header', async () => {
    const { dependencies, tokens } = statefulDependencies();
    const request = requestWith(undefined);
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(request, {} as Response, next);

    expect(expectedError(next)).toMatchObject({
      statusCode: 401,
      code: 'AUTH_TOKEN_MISSING',
    });
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
    expect(request.auth).toBeUndefined();
  });

  it.each(['Basic abc', 'Bearer', 'Bearer ', 'bearer-token'])(
    'rejects a malformed Authorization header: %s',
    async (authorization) => {
      const { dependencies } = statefulDependencies();
      const next = vi.fn();

      await createAuthenticateMiddleware(dependencies)(
        requestWith(authorization),
        {} as Response,
        next,
      );

      expect(expectedError(next)).toMatchObject({
        statusCode: 401,
        code: 'AUTH_TOKEN_INVALID',
      });
    },
  );

  it('rejects a token whose user no longer matches the session', async () => {
    const { dependencies } = statefulDependencies({
      session: { userId: '99999999-9999-4999-8999-999999999999' },
    });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
  });

  it('rejects a token whose organization no longer matches the session', async () => {
    const { dependencies } = statefulDependencies({
      session: { organizationId: '99999999-9999-4999-8999-999999999999' },
    });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
  });

  it('rejects an unknown session as revoked', async () => {
    const { dependencies } = statefulDependencies({ session: null });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({
      statusCode: 401,
      code: 'AUTH_SESSION_REVOKED',
    });
  });

  it('rejects a revoked session', async () => {
    const { dependencies } = statefulDependencies({
      session: { revokedAt: NOW },
    });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({
      statusCode: 401,
      code: 'AUTH_SESSION_REVOKED',
    });
  });

  it('rejects an idle-expired session', async () => {
    const { dependencies } = statefulDependencies({
      session: { expiresAt: NOW },
    });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({
      statusCode: 401,
      code: 'AUTH_SESSION_EXPIRED',
    });
  });

  it('rejects an absolute-expired session', async () => {
    const { dependencies } = statefulDependencies({
      session: { absoluteExpiresAt: NOW },
    });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({
      statusCode: 401,
      code: 'AUTH_SESSION_EXPIRED',
    });
  });

  it('rejects a session whose user disappeared', async () => {
    const { dependencies } = statefulDependencies({ user: null });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
  });

  it('rejects a disabled account', async () => {
    const { dependencies } = statefulDependencies({ user: { isActive: false } });
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({
      statusCode: 403,
      code: 'AUTH_ACCOUNT_DISABLED',
    });
  });

  it('populates req.auth for a valid session', async () => {
    const { dependencies } = statefulDependencies();
    const request = createRequest();
    const next = vi.fn();

    await createAuthenticateMiddleware(dependencies)(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(request.auth).toEqual(CONTEXT);
  });
});

describe('optional authentication', () => {
  it('continues anonymously when the header is absent', async () => {
    const { dependencies, tokens } = statefulDependencies();
    const request = requestWith(undefined);
    const next = vi.fn();

    await createOptionalAuthenticateMiddleware(dependencies)(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(request.auth).toBeUndefined();
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('still rejects a revoked session when a token is present', async () => {
    const { dependencies } = statefulDependencies({
      session: { revokedAt: NOW },
    });
    const next = vi.fn();

    await createOptionalAuthenticateMiddleware(dependencies)(createRequest(), {} as Response, next);

    expect(expectedError(next)).toMatchObject({ code: 'AUTH_SESSION_REVOKED' });
  });

  it('populates req.auth for a valid token', async () => {
    const { dependencies } = statefulDependencies();
    const request = createRequest();
    const next = vi.fn();

    await createOptionalAuthenticateMiddleware(dependencies)(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(request.auth).toEqual(CONTEXT);
  });
});
