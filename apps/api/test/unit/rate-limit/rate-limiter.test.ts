import { describe, expect, it } from 'vitest';
import { InMemoryRateLimitStore } from '../../../src/shared/rate-limit/in-memory-rate-limit.store.js';
import { RedisUnavailableError } from '../../../src/shared/rate-limit/rate-limit.errors.js';
import type { RateLimitStore } from '../../../src/shared/rate-limit/rate-limit.store.js';
import { RateLimiter } from '../../../src/shared/rate-limit/rate-limiter.js';

function createLimiter(store: RateLimitStore = new InMemoryRateLimitStore(), failClosed = true) {
  return new RateLimiter({
    store,
    keyPrefix: 'eventpulse',
    pepper: 'rate-limit-pepper',
    failClosed,
  });
}

class FailingStore implements RateLimitStore {
  increment(): Promise<never> {
    return Promise.reject(new RedisUnavailableError(new Error('redis down')));
  }

  getTtl(): Promise<never> {
    return Promise.reject(new RedisUnavailableError(new Error('redis down')));
  }

  setMax(): Promise<never> {
    return Promise.reject(new RedisUnavailableError(new Error('redis down')));
  }

  delete(): Promise<never> {
    return Promise.reject(new RedisUnavailableError(new Error('redis down')));
  }
}

class RecordingStore extends InMemoryRateLimitStore {
  readonly keys: string[] = [];

  override async increment(key: string, windowSeconds: number) {
    this.keys.push(key);
    return super.increment(key, windowSeconds);
  }
}

describe('RateLimiter', () => {
  it('allows requests up to the limit and rejects the next one with a retry delay', async () => {
    const limiter = createLimiter();
    const identifiers = ['203.0.113.10', 'user@example.com'];

    await expect(limiter.consume('login', identifiers, 2, 60)).resolves.toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    await expect(limiter.consume('login', identifiers, 2, 60)).resolves.toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });

    const denied = await limiter.consume('login', identifiers, 2, 60);

    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('scopes counters by identifiers without storing them in clear', async () => {
    const store = new RecordingStore();
    const limiter = createLimiter(store);
    const email = 'user@example.com';

    await limiter.consume('login', ['203.0.113.10', email], 10, 60);

    const key = store.keys[0] ?? '';

    expect(key.startsWith('eventpulse:auth:login:')).toBe(true);
    expect(key).not.toContain(email);
    expect(key).not.toContain('203.0.113.10');
  });

  it('applies progressive exponential lockout and caps it', async () => {
    const limiter = createLimiter();
    const identifiers = ['account'];
    const policy = { threshold: 3, baseSeconds: 60, maxSeconds: 3_600 };

    await limiter.recordFailure('login-failure', identifiers, policy);
    await limiter.recordFailure('login-failure', identifiers, policy);
    await expect(limiter.getLockSeconds('login-failure', identifiers)).resolves.toBe(0);

    await limiter.recordFailure('login-failure', identifiers, policy);
    const firstLock = await limiter.getLockSeconds('login-failure', identifiers);

    expect(firstLock).toBeGreaterThan(50);
    expect(firstLock).toBeLessThanOrEqual(60);

    await limiter.recordFailure('login-failure', identifiers, policy);
    const secondLock = await limiter.getLockSeconds('login-failure', identifiers);

    expect(secondLock).toBeGreaterThan(100);
    expect(secondLock).toBeLessThanOrEqual(120);
  });

  it('extends the lock monotonically under concurrent failures', async () => {
    const limiter = createLimiter();
    const policy = { threshold: 5, baseSeconds: 60, maxSeconds: 3_600 };

    await Promise.all(
      Array.from({ length: 8 }, () => limiter.recordFailure('login-failure', ['key'], policy)),
    );

    expect(await limiter.getLockSeconds('login-failure', ['key'])).toBeGreaterThan(300);
  });

  it('never shortens an existing lock', async () => {
    const store = new InMemoryRateLimitStore();

    await store.setMax('eventpulse:auth:login-failure:key:lock', 300);
    await store.setMax('eventpulse:auth:login-failure:key:lock', 60);

    expect(await store.getTtl('eventpulse:auth:login-failure:key:lock')).toBeGreaterThan(250);
  });

  it('clears both the failure counter and the active lock', async () => {
    const limiter = createLimiter();
    const identifiers = ['account'];
    const policy = { threshold: 1, baseSeconds: 60, maxSeconds: 60 };

    await limiter.recordFailure('login-failure', identifiers, policy);
    expect(await limiter.getLockSeconds('login-failure', identifiers)).toBeGreaterThan(0);

    await limiter.clearFailures('login-failure', identifiers);

    expect(await limiter.getLockSeconds('login-failure', identifiers)).toBe(0);
  });

  it('fails closed when Redis is unavailable by default', async () => {
    const limiter = createLimiter(new FailingStore(), true);

    await expect(limiter.consume('login', ['ip'], 10, 60)).rejects.toBeInstanceOf(
      RedisUnavailableError,
    );
    await expect(
      limiter.recordFailure('login-failure', ['ip'], {
        threshold: 5,
        baseSeconds: 60,
        maxSeconds: 3600,
      }),
    ).rejects.toBeInstanceOf(RedisUnavailableError);
  });

  it('can fail open explicitly for non-security-critical deployments', async () => {
    const limiter = createLimiter(new FailingStore(), false);

    await expect(limiter.consume('login', ['ip'], 10, 60)).resolves.toEqual({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 0,
    });
    await expect(limiter.getLockSeconds('login', ['ip'])).resolves.toBe(0);
    await expect(
      limiter.recordFailure('login-failure', ['ip'], {
        threshold: 5,
        baseSeconds: 60,
        maxSeconds: 3600,
      }),
    ).resolves.toBeUndefined();
  });
});
