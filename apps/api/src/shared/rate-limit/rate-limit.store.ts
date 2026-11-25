export interface RateLimitCounter {
  count: number;
  ttlSeconds: number;
}

export interface RateLimitStore {
  increment(key: string, windowSeconds: number): Promise<RateLimitCounter>;
  getTtl(key: string): Promise<number>;
  setMax(key: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}
