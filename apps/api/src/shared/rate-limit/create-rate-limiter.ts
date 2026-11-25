import { env } from '../../config/env.js';
import { getSharedRedis } from '../redis/redis-connection.js';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store.js';
import { RateLimiter } from './rate-limiter.js';
import { RedisRateLimitStore } from './redis-rate-limit.store.js';

export function createRateLimiter(): RateLimiter {
  const store =
    env.REDIS_URL === undefined
      ? new InMemoryRateLimitStore()
      : new RedisRateLimitStore(getSharedRedis());

  return new RateLimiter({
    store,
    keyPrefix: env.REDIS_KEY_PREFIX ?? 'eventpulse',
    pepper: env.REFRESH_TOKEN_PEPPER ?? 'development-only-rate-limit-pepper',
    // Defense in depth: even if config validation is bypassed, production auth
    // rate limiting must never fall back to fail-open.
    failClosed: env.NODE_ENV === 'production' || (env.AUTH_RATE_LIMIT_FAIL_CLOSED ?? true),
  });
}
