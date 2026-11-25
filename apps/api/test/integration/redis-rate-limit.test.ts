import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisUnavailableError } from '../../src/shared/rate-limit/rate-limit.errors.js';
import { RateLimiter } from '../../src/shared/rate-limit/rate-limiter.js';
import { RedisRateLimitStore } from '../../src/shared/rate-limit/redis-rate-limit.store.js';
import { closeSharedRedis, getSharedRedis } from '../../src/shared/redis/redis-connection.js';

const REDIS_URL = process.env.TEST_REDIS_URL;
const PREFIX = `eventpulse-integration-${randomUUID()}`;
const describeWithRedis = REDIS_URL === undefined ? describe.skip : describe;

let client: Redis | undefined;

function redis(): Redis {
  if (client === undefined) {
    throw new Error('Redis client is not connected');
  }

  return client;
}

describeWithRedis('real Redis rate limiting', () => {
  beforeAll(async () => {
    client = new Redis(REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      lazyConnect: true,
    });

    await client.connect();
    await client.ping();
  });

  afterAll(async () => {
    const current = client;
    client = undefined;

    if (current !== undefined) {
      try {
        const keys = await current.keys(`${PREFIX}:*`);

        if (keys.length > 0) {
          await current.del(...keys);
        }

        await current.quit();
      } catch {
        current.disconnect();
      }
    }

    await closeSharedRedis();
  });

  it('executes the Lua increment atomically under concurrency', async () => {
    const store = new RedisRateLimitStore(redis());
    const key = `${PREFIX}:atomic`;

    const counters = await Promise.all(Array.from({ length: 100 }, () => store.increment(key, 60)));
    const counts = counters.map((counter) => counter.count).sort((left, right) => left - right);

    expect(counts).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(counters.every((counter) => counter.ttlSeconds >= 1)).toBe(true);
    expect(await redis().pttl(key)).toBeGreaterThan(0);
  });

  it('enforces limits and reports retry-after from the real counter', async () => {
    const store = new RedisRateLimitStore(redis());
    const limiter = new RateLimiter({
      store,
      keyPrefix: PREFIX,
      pepper: 'integration-rate-limit-pepper',
      failClosed: true,
    });

    const first = await limiter.consume('login-rate', ['203.0.113.1', 'user@example.com'], 2, 60);
    const second = await limiter.consume('login-rate', ['203.0.113.1', 'user@example.com'], 2, 60);
    const third = await limiter.consume('login-rate', ['203.0.113.1', 'user@example.com'], 2, 60);

    expect(first).toMatchObject({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(second).toMatchObject({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(third).toMatchObject({ allowed: false, remaining: 0 });
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('stores a progressive lock and deletes it only on clear', async () => {
    const store = new RedisRateLimitStore(redis());
    const limiter = new RateLimiter({
      store,
      keyPrefix: PREFIX,
      pepper: 'integration-rate-limit-pepper',
      failClosed: true,
    });
    const identifiers = ['locked@example.com', '203.0.113.2'];
    const policy = { threshold: 3, baseSeconds: 5, maxSeconds: 20 };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await limiter.recordFailure('login-failure', identifiers, policy);
    }

    const lockSeconds = await limiter.getLockSeconds('login-failure', identifiers);
    expect(lockSeconds).toBeGreaterThan(0);
    expect(lockSeconds).toBeLessThanOrEqual(20);

    await limiter.clearFailures('login-failure', identifiers);
    await expect(limiter.getLockSeconds('login-failure', identifiers)).resolves.toBe(0);
  });

  it('never shortens an existing lock TTL', async () => {
    const store = new RedisRateLimitStore(redis());
    const key = `${PREFIX}:extend-only`;

    await store.setMax(key, 20);
    await store.setMax(key, 1);

    await expect(store.getTtl(key)).resolves.toBeGreaterThan(15);
  });

  it('fails closed when the real Redis endpoint is unavailable', async () => {
    const unavailable = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 200,
      retryStrategy: () => null,
    });
    unavailable.on('error', () => undefined);

    try {
      await expect(unavailable.connect()).rejects.toThrow();

      const limiter = new RateLimiter({
        store: new RedisRateLimitStore(unavailable),
        keyPrefix: PREFIX,
        pepper: 'integration-rate-limit-pepper',
        failClosed: true,
      });

      await expect(limiter.consume('fail-closed', ['203.0.113.3'], 5, 60)).rejects.toBeInstanceOf(
        RedisUnavailableError,
      );
    } finally {
      unavailable.disconnect();
    }
  });

  it('recreates the shared client after the previous connection ends', async () => {
    const first = getSharedRedis();
    await vi.waitFor(() => expect(first.status).toBe('ready'), { timeout: 2_000 });
    await expect(first.ping()).resolves.toBe('PONG');

    first.disconnect();

    await vi.waitFor(
      () => {
        expect(getSharedRedis()).not.toBe(first);
      },
      { timeout: 2_000 },
    );

    const second = getSharedRedis();
    await vi.waitFor(() => expect(second.status).toBe('ready'), { timeout: 2_000 });
    await expect(second.ping()).resolves.toBe('PONG');
    expect(second).not.toBe(first);
  });
});
