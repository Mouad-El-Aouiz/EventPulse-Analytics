import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { RedisUnavailableError } from '../../../src/shared/rate-limit/rate-limit.errors.js';
import { RedisRateLimitStore } from '../../../src/shared/rate-limit/redis-rate-limit.store.js';

function createClient() {
  return {
    eval: vi.fn(),
    pttl: vi.fn(),
    del: vi.fn(),
  };
}

function createStore(client: ReturnType<typeof createClient>) {
  return new RedisRateLimitStore(client as unknown as Redis);
}

describe('RedisRateLimitStore', () => {
  it('increments atomically with a millisecond TTL', async () => {
    const client = createClient();
    client.eval.mockResolvedValue([2, 59_500]);
    const store = createStore(client);

    await expect(store.increment('key', 60)).resolves.toEqual({ count: 2, ttlSeconds: 60 });
    expect(client.eval).toHaveBeenCalledWith(expect.any(String), 1, 'key', '60000');
  });

  it('returns a zero TTL for missing keys', async () => {
    const client = createClient();
    client.pttl.mockResolvedValue(-2);

    await expect(createStore(client).getTtl('key')).resolves.toBe(0);
  });

  it('extends lock keys atomically only when the new TTL is longer', async () => {
    const client = createClient();
    client.eval.mockResolvedValue(1);
    const store = createStore(client);

    await store.setMax('key:lock', 120);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('PTTL', KEYS[1])"),
      1,
      'key:lock',
      '120000',
    );
  });

  it('deletes counters', async () => {
    const client = createClient();
    const store = createStore(client);

    await store.delete('key');

    expect(client.del).toHaveBeenCalledWith('key');
  });

  it('maps every Redis failure to RedisUnavailableError', async () => {
    const client = createClient();
    client.eval.mockRejectedValue(new Error('connection lost'));
    client.pttl.mockRejectedValue(new Error('connection lost'));
    client.del.mockRejectedValue(new Error('connection lost'));
    const store = createStore(client);

    await expect(store.increment('key', 60)).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(store.getTtl('key')).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(store.setMax('key', 60)).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(store.delete('key')).rejects.toBeInstanceOf(RedisUnavailableError);
  });
});
