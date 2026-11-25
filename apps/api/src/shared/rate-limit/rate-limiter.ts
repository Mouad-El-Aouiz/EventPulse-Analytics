import { createHmac } from 'node:crypto';
import { RedisUnavailableError } from './rate-limit.errors.js';
import type { RateLimitStore } from './rate-limit.store.js';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  store: RateLimitStore;
  keyPrefix: string;
  pepper: string;
  failClosed: boolean;
}

export interface FailurePolicy {
  threshold: number;
  baseSeconds: number;
  maxSeconds: number;
}

const MAX_EXPONENT = 20;

export class RateLimiter {
  private readonly store: RateLimitStore;
  private readonly keyPrefix: string;
  private readonly pepper: string;
  private readonly failClosed: boolean;

  constructor(options: RateLimiterOptions) {
    this.store = options.store;
    this.keyPrefix = options.keyPrefix;
    this.pepper = options.pepper;
    this.failClosed = options.failClosed;
  }

  private hash(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('base64url').slice(0, 43);
  }

  private key(scope: string, identifiers: readonly string[]): string {
    const hashed = identifiers.map((identifier) => this.hash(identifier)).join(':');

    return `${this.keyPrefix}:auth:${scope}:${hashed}`;
  }

  private async run<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof RedisUnavailableError && !this.failClosed) {
        return fallback;
      }

      throw error;
    }
  }

  async consume(
    scope: string,
    identifiers: readonly string[],
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitDecision> {
    const key = this.key(scope, identifiers);

    return this.run(
      async () => {
        const counter = await this.store.increment(key, windowSeconds);

        return {
          allowed: counter.count <= limit,
          remaining: Math.max(0, limit - counter.count),
          retryAfterSeconds: counter.count <= limit ? 0 : Math.max(1, counter.ttlSeconds),
        };
      },
      { allowed: true, remaining: limit, retryAfterSeconds: 0 },
    );
  }

  async getLockSeconds(scope: string, identifiers: readonly string[]): Promise<number> {
    const key = `${this.key(scope, identifiers)}:lock`;

    return this.run(() => this.store.getTtl(key), 0);
  }

  async recordFailure(
    scope: string,
    identifiers: readonly string[],
    policy: FailurePolicy,
  ): Promise<void> {
    const key = this.key(scope, identifiers);

    await this.run(async () => {
      const counter = await this.store.increment(
        key,
        Math.max(policy.maxSeconds, policy.baseSeconds),
      );

      if (counter.count >= policy.threshold) {
        const exponent = Math.min(counter.count - policy.threshold, MAX_EXPONENT);
        const lockSeconds = Math.min(policy.baseSeconds * 2 ** exponent, policy.maxSeconds);

        await this.store.setMax(`${key}:lock`, lockSeconds);
      }
    }, undefined);
  }

  async clearFailures(scope: string, identifiers: readonly string[]): Promise<void> {
    const key = this.key(scope, identifiers);

    await this.run(async () => {
      await this.store.delete(key);
      await this.store.delete(`${key}:lock`);
    }, undefined);
  }
}
