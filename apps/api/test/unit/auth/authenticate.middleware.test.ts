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
