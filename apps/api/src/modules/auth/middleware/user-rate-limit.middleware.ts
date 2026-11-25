import type { RequestHandler } from 'express';
import { RateLimitError } from '../../../shared/rate-limit/rate-limit.errors.js';
import type { RateLimiter } from '../../../shared/rate-limit/rate-limiter.js';
import { tokenMissingError } from '../auth.errors.js';

const USER_RATE_SCOPE = 'user';

export function createUserRateLimitMiddleware(
  rateLimiter: RateLimiter,
  maxAttempts: number,
  windowSeconds: number,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const context = req.actor ?? req.auth;

      if (context === undefined) {
        throw tokenMissingError();
      }

      const decision = await rateLimiter.consume(
        USER_RATE_SCOPE,
        [context.userId],
        maxAttempts,
        windowSeconds,
      );

      if (!decision.allowed) {
        throw new RateLimitError(decision.retryAfterSeconds);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
