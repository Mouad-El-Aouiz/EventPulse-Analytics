import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, redisClient } = vi.hoisted(() => {
  const unavailable = () => Promise.reject(new Error('redis down'));

  return {
    mockEnv: {
      NODE_ENV: 'production' as string,
      REDIS_URL: 'redis://localhost:6379' as string | undefined,
      REDIS_KEY_PREFIX: 'eventpulse',
      REFRESH_TOKEN_PEPPER: 'test-pepper',
      AUTH_RATE_LIMIT_FAIL_CLOSED: false as boolean | undefined,
    },
    redisClient: {
      eval: unavailable,
      pttl: unavailable,
      set: unavailable,
      del: unavailable,
    },
  };
});

vi.mock('../../../src/config/env.js', () => ({ env: mockEnv }));
vi.mock('../../../src/shared/redis/redis-connection.js', () => ({
  getSharedRedis: () => redisClient,
}));

import { createRateLimiter } from '../../../src/shared/rate-limit/create-rate-limiter.js';
import { RedisUnavailableError } from '../../../src/shared/rate-limit/rate-limit.errors.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.REDIS_URL = 'redis://localhost:6379';
    mockEnv.AUTH_RATE_LIMIT_FAIL_CLOSED = false;
  });

  it('constructs successfully when Redis is unavailable at startup', () => {
    expect(() => createRateLimiter()).not.toThrow();
  });

  it('forces fail-closed in production even when the environment disables it', async () => {
    const limiter = createRateLimiter();

    await expect(limiter.consume('login-rate', ['203.0.113.10'], 10, 60)).rejects.toBeInstanceOf(
      RedisUnavailableError,
    );
  });

  it('keeps failing closed for every sensitive operation after the outage starts', async () => {
    const limiter = createRateLimiter();

    await expect(
      limiter.getLockSeconds('login-failure', ['user@example.com']),
    ).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(
      limiter.recordFailure('login-failure', ['user@example.com'], {
        threshold: 5,
        baseSeconds: 60,
        maxSeconds: 3_600,
      }),
    ).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(limiter.consume('refresh', ['session-id'], 60, 3_600)).rejects.toBeInstanceOf(
      RedisUnavailableError,
    );
  });

  it('honours explicit fail-open outside production', async () => {
    mockEnv.NODE_ENV = 'test';
    mockEnv.AUTH_RATE_LIMIT_FAIL_CLOSED = false;

    const limiter = createRateLimiter();

    await expect(limiter.consume('login-rate', ['203.0.113.10'], 10, 60)).resolves.toEqual({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 0,
    });
  });
});
