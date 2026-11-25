import type { RateLimitCounter, RateLimitStore } from './rate-limit.store.js';

interface Entry {
  count: number;
  expiresAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, Entry>();

  async increment(key: string, windowSeconds: number): Promise<RateLimitCounter> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (existing === undefined || existing.expiresAt <= now) {
      const expiresAt = now + windowSeconds * 1000;
      this.entries.set(key, { count: 1, expiresAt });

      return { count: 1, ttlSeconds: windowSeconds };
    }

    existing.count += 1;

    return {
      count: existing.count,
      ttlSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }

  async getTtl(key: string): Promise<number> {
    const entry = this.entries.get(key);

    if (entry === undefined || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return 0;
    }

    return Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async setMax(key: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const existing = this.entries.get(key);

    if (existing !== undefined && existing.expiresAt > expiresAt) {
      return;
    }

    this.entries.set(key, { count: 1, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
