import type { RequestHandler } from 'express';
import type { Clock } from '../../../shared/ports/clock.port.js';
import type { AuthContext } from '../../../shared/types/actor-context.js';
import {
  accountDisabledError,
  sessionExpiredError,
  sessionRevokedError,
  tokenInvalidError,
  tokenMissingError,
} from '../auth.errors.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { TokenService } from '../services/token.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    actor?: import('../../../shared/types/actor-context.js').ActorContext;
  }
}

export interface AuthenticateDependencies {
  tokens: TokenService;
  sessions: SessionRepository;
  users: UserRepository;
  clock: Clock;
}

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

function createAuthenticationHandler(
  dependencies: AuthenticateDependencies,
  required: boolean,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const authorization = req.get('authorization');

      if (authorization === undefined) {
        if (required) {
          throw tokenMissingError();
        }

        next();
        return;
      }

      const match = BEARER_PATTERN.exec(authorization);

      if (match === null || match[1] === undefined) {
        throw tokenInvalidError();
      }

      const context = await dependencies.tokens.verifyAccessToken(match[1]);
      const session = await dependencies.sessions.findById(context.sessionId);
      const now = dependencies.clock.now();

      if (session === null) {
        throw sessionRevokedError();
      }

      if (session.userId !== context.userId || session.organizationId !== context.organizationId) {
        throw tokenInvalidError();
      }

      if (session.revokedAt !== null) {
        throw sessionRevokedError();
      }

      if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
        throw sessionExpiredError();
      }

      const user = await dependencies.users.findById(context.userId);

      if (user === null) {
        throw tokenInvalidError();
      }

      if (!user.isActive) {
        throw accountDisabledError();
      }

      req.auth = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createAuthenticateMiddleware(
  dependencies: AuthenticateDependencies,
): RequestHandler {
  return createAuthenticationHandler(dependencies, true);
}

export function createOptionalAuthenticateMiddleware(
  dependencies: AuthenticateDependencies,
): RequestHandler {
  return createAuthenticationHandler(dependencies, false);
}
