import type { Redis } from 'ioredis';
import { RedisUnavailableError } from './rate-limit.errors.js';
import type { RateLimitCounter, RateLimitStore } from './rate-limit.store.js';

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

const SET_MAX_SCRIPT = `
local ttl = redis.call('PTTL', KEYS[1])
local requested = tonumber(ARGV[1])
if ttl < 0 or ttl < requested then
  redis.call('SET', KEYS[1], '1', 'PX', requested)
end
return 1
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: Redis) {}

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new RedisUnavailableError(error);
    }
  }

  async increment(key: string, windowSeconds: number): Promise<RateLimitCounter> {
    return this.run(async () => {
      const result = (await this.client.eval(
        INCREMENT_SCRIPT,
        1,
        key,
        String(windowSeconds * 1000),
      )) as [number, number];

      return {
        count: Number(result[0]),
        ttlSeconds: Math.max(1, Math.ceil(Number(result[1]) / 1000)),
      };
    });
  }

  async getTtl(key: string): Promise<number> {
    return this.run(async () => {
      const ttl = await this.client.pttl(key);

      if (ttl < 0) {
        return 0;
      }

      return Math.max(1, Math.ceil(ttl / 1000));
    });
  }

  async setMax(key: string, ttlSeconds: number): Promise<void> {
    await this.run(async () => {
      await this.client.eval(SET_MAX_SCRIPT, 1, key, String(ttlSeconds * 1000));
    });
  }

  async delete(key: string): Promise<void> {
    await this.run(async () => {
      await this.client.del(key);
    });
  }
}
