import type { RequestHandler } from 'express';
import { RateLimitError } from '../../../shared/rate-limit/rate-limit.errors.js';
import type { RateLimiter } from '../../../shared/rate-limit/rate-limiter.js';

const PUBLIC_INVITATION_SCOPE = 'invitation-accept-ip';

export function createPublicInvitationRateLimitMiddleware(
  rateLimiter: RateLimiter,
  maxAttempts: number,
  windowSeconds: number,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      const decision = await rateLimiter.consume(
        PUBLIC_INVITATION_SCOPE,
        [req.ip ?? 'unknown'],
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
